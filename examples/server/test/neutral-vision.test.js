import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGalleryConfig } from '../src/gallery/gallery-config.js';
import { GALLERY_ERRORS } from '../src/gallery/gallery-errors.js';
import { NeutralVision, NEUTRAL_VISION_PROMPT } from '../src/gallery/neutral-vision.js';
import { createGalleryCore, GallerySettingsStore } from '../src/gallery/index.js';
import { makeGalleryFixture, pngBytes } from '../test-support/gallery-fixture.js';

async function withFixture(callback) {
  const fixture = await makeGalleryFixture();
  try { await callback(fixture); } finally { await fixture.cleanup(); }
}

test('neutral vision stores only the first_description and preserves its first value', async () => {
  await withFixture(async ({ ingest, attachment, store, memory }) => {
    const item = (await ingest.ingestCyberbossAttachment(attachment)).item;
    let body;
    const vision = new NeutralVision({
      store,
      memory,
      config: { baseUrl: 'https://vision.example/v1/', model: 'small-vision', apiKey: 'test', timeoutMs: 5000 },
      fetchImpl: async (_url, options) => {
        body = JSON.parse(options.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: '一只白色杯子位于画面中央，桌面是浅棕色。' } }] }), { status: 200 });
      },
    });
    const before = await store.get(item.id);
    assert.equal(await vision.describeAndStore(item.id), '一只白色杯子位于画面中央，桌面是浅棕色。');
    const after = await store.get(item.id);
    assert.equal(after.title, before.title);
    assert.equal(after.first_impression, before.first_impression);
    assert.equal(after.first_context_note, before.first_context_note);
    assert.equal(after.first_description, '一只白色杯子位于画面中央，桌面是浅棕色。');
    assert.equal(body.model, 'small-vision');
    assert.equal(body.messages[0].content[0].text, NEUTRAL_VISION_PROMPT);
    assert.equal(await vision.describeAndStore(item.id), after.first_description);
  });
});

test('missing vision configuration skips description and never blocks ingest', async () => {
  await withFixture(async ({ ingest, attachment, store, memory }) => {
    const result = await ingest.ingestCyberbossAttachment(attachment);
    const vision = new NeutralVision({ store, memory, config: {} });
    assert.deepEqual(await vision.describeAndStore(result.item.id), { skipped: true, reason: GALLERY_ERRORS.visionNotConfigured });
    assert.equal((await store.get(result.item.id)).id, result.item.id);
  });
});

test('neutral vision reads current settings before each new image request', async () => {
  await withFixture(async ({ ingest, attachment, sourcePath, store, memory }) => {
    const rootDir = store.rootDir;
    const visionConfig = { baseUrl: 'https://vision.example/v1', apiKey: '', model: 'first-model', timeoutMs: 5000 };
    const core = createGalleryCore({ rootDir, vision: visionConfig });
    const first = (await core.ingest.ingestCyberbossAttachment(attachment)).item;
    const settings = new GallerySettingsStore({ rootDir, defaults: visionConfig });
    await writeFile(sourcePath, pngBytes('second distinct image'));
    const second = (await core.ingest.ingestCyberbossAttachment(attachment)).item;
    const models = [];
    core.neutralVision.fetchImpl = async (_url, options) => {
      models.push(JSON.parse(options.body).model);
      return new Response(JSON.stringify({ choices: [{ message: { content: '直接可见的一组图像事实描述。' } }] }), { status: 200 });
    };
    await core.neutralVision.describeAndStore(first.id);
    await settings.saveVisionSettings({ baseUrl: 'https://vision.example/v1', model: 'next-model', timeoutMs: 5000, apiKey: '' });
    await core.neutralVision.describeAndStore(second.id);
    assert.deepEqual(models, ['first-model', 'next-model']);
  });
});

test('Gallery vision reads only its own environment variables', () => {
  const config = loadGalleryConfig({
    CYBERBOSS_GALLERY_ROOT: 'state/gallery-test',
    CYBERBOSS_GALLERY_VISION_BASE_URL: 'https://vision.example/v1',
    CYBERBOSS_GALLERY_VISION_API_KEY: 'local-test-key',
    CYBERBOSS_GALLERY_VISION_MODEL: 'dsv4.1flash',
    CYBERBOSS_GALLERY_VISION_TIMEOUT_MS: '12345',
  }, 'C:/workspace');
  assert.equal(config.rootDir, 'C:\\workspace\\state\\gallery-test');
  assert.deepEqual(config.vision, {
    baseUrl: 'https://vision.example/v1', apiKey: 'local-test-key', model: 'dsv4.1flash', timeoutMs: 12345,
  });
});

test('neutral worker prompt covers visible details and excludes identity and sentiment inference', () => {
  assert.match(NEUTRAL_VISION_PROMPT, /directly visible facts/);
  assert.match(NEUTRAL_VISION_PROMPT, /composition, colors, lighting, spatial relationships/);
  assert.match(NEUTRAL_VISION_PROMPT, /Do not infer identity, psychology, emotion, intention, relationship/);
  assert.match(NEUTRAL_VISION_PROMPT, /Do not add a label, markdown, JSON, tags/);
});
