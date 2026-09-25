import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { GallerySettingsStore } from '../src/gallery/gallery-settings-store.js';
import { makeGalleryFixture } from '../test-support/gallery-fixture.js';

process.env.NODE_ENV = 'test';
const { createApp, loadWebServerConfig } = await import('../src/server.js');

async function withServer(callback, defaults = {}) {
  const fixture = await makeGalleryFixture();
  const settingsStore = new GallerySettingsStore({ rootDir: fixture.rootDir, defaults });
  const core = {
    store: fixture.store,
    memory: fixture.memory,
    ingest: fixture.ingest,
    neutralVision: { async describeAndStore() {} },
  };
  const server = createApp({ core, settingsStore, staticDir: null }).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    await callback({ fixture, settingsStore, request: (route, options) => fetch(`http://127.0.0.1:${server.address().port}${route}`, options) });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fixture.cleanup();
  }
}

test('web server defaults to loopback and supports explicit host/port', () => {
  assert.deepEqual(loadWebServerConfig({}), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(loadWebServerConfig({ CYBERBOSS_GALLERY_WEB_HOST: '127.0.0.2', CYBERBOSS_GALLERY_WEB_PORT: '9000' }), {
    host: '127.0.0.2', port: 9000,
  });
});

test('gallery list returns only safe metadata and image URL', async () => {
  await withServer(async ({ fixture, request }) => {
    const item = (await fixture.ingest.ingestCyberbossAttachment(fixture.attachment)).item;
    await fixture.memory.setCompanionMemory(item.id, { title: '窗边', firstImpression: '光线很柔和', contextNote: '午后' });
    const response = await request('/api/gallery');
    assert.equal(response.status, 200);
    const [listed] = await response.json();
    assert.equal(listed.id, item.id);
    assert.equal(listed.title, '窗边');
    assert.equal(listed.image_url, `/api/gallery/${item.id}/image`);
    assert.equal('storage_path' in listed, false);
    assert.equal('absolutePath' in listed, false);
  });
});

test('image endpoint validates ids, serves stored bytes privately, and returns 404 when missing', async () => {
  await withServer(async ({ fixture, request }) => {
    const item = (await fixture.ingest.ingestCyberbossAttachment(fixture.attachment)).item;
    const response = await request(`/api/gallery/${item.id}/image`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(fixture.store.paths(item.id, 'image/png').image));
    assert.equal((await request('/api/gallery/not-a-hash/image')).status, 400);
    assert.equal((await request(`/api/gallery/${'a'.repeat(64)}/image`)).status, 404);
  });
});

test('rename changes title only and keeps first memory fields', async () => {
  await withServer(async ({ fixture, request }) => {
    const item = (await fixture.ingest.ingestCyberbossAttachment(fixture.attachment)).item;
    await fixture.memory.setCompanionMemory(item.id, { title: '旧标题', firstImpression: '第一印象', contextNote: '当时的消息' });
    const response = await request(`/api/gallery/${item.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '新标题' }),
    });
    const renamed = await response.json();
    assert.equal(response.status, 200);
    assert.equal(renamed.title, '新标题');
    assert.equal(renamed.first_impression, '第一印象');
    assert.equal(renamed.first_context_note, '当时的消息');
    assert.equal(renamed.first_description, '');
    const forbidden = await request(`/api/gallery/${item.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '不能改记忆', first_impression: '修改内容' }),
    });
    assert.equal(forbidden.status, 400);
    assert.equal((await fixture.store.get(item.id)).first_impression, '第一印象');
  });
});

test('vision settings read env defaults, never return the key, and preserve it when PATCH key is blank', async () => {
  await withServer(async ({ fixture, request, settingsStore }) => {
    assert.deepEqual(await settingsStore.getVisionSettings(), {
      baseUrl: 'https://vision.example/v1', model: 'vision-small', timeoutMs: 12345, apiKeyConfigured: true,
    });
    const initial = await request('/api/settings/vision');
    assert.equal(initial.status, 200);
    assert.equal((await initial.text()).includes('secret-key'), false);
    const firstSave = await request('/api/settings/vision', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://new.example/v1', model: 'dsv4.1flash', timeoutMs: 30000, apiKey: 'new-secret' }),
    });
    assert.deepEqual(await firstSave.json(), {
      baseUrl: 'https://new.example/v1', model: 'dsv4.1flash', timeoutMs: 30000, apiKeyConfigured: true,
    });
    assert.equal((await settingsStore.getVisionConfig()).apiKey, 'new-secret');
    const secondSave = await request('/api/settings/vision', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://next.example/v1', model: 'next-model', timeoutMs: 40000, apiKey: '' }),
    });
    assert.equal((await secondSave.json()).apiKeyConfigured, true);
    assert.equal((await settingsStore.getVisionConfig()).apiKey, 'new-secret');
    assert.equal((await request('/api/settings/vision').then((response) => response.text())).includes('new-secret'), false);
    const json = JSON.parse(await readFile(settingsStore.filePath, 'utf8'));
    assert.equal(json.vision.apiKey, 'new-secret');
    assert.equal((await readdir(fixture.rootDir)).some((name) => name.endsWith('.tmp')), false);
    if (process.platform !== 'win32') assert.equal((await stat(settingsStore.filePath)).mode & 0o077, 0);
  }, { baseUrl: 'https://vision.example/v1', apiKey: 'secret-key', model: 'vision-small', timeoutMs: 12345 });
});

test('vision settings without persisted file use defaults', async () => {
  await withServer(async ({ request }) => {
    assert.deepEqual(await (await request('/api/settings/vision')).json(), {
      baseUrl: '', model: '', timeoutMs: 30000, apiKeyConfigured: false,
    });
  });
});
