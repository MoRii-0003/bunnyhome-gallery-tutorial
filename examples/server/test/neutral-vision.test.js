import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
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

test('neutral vision describes the image for the explicit save flow', async () => {
  await withFixture(async ({ attachment, store }) => {
    const vision = new NeutralVision({
      config: { baseUrl: 'https://vision.example/v1/', model: 'small-vision', apiKey: 'test', timeoutMs: 5000 },
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'small-vision');
        assert.equal(body.messages[0].content[0].text, NEUTRAL_VISION_PROMPT);
        return new Response(JSON.stringify({ choices: [{ message: { content: '一只白色杯子位于画面中央，桌面是浅棕色。' } }] }), { status: 200 });
      },
    });
    const description = await vision.describeImage({ bytes: Buffer.from('image bytes'), mediaType: 'image/png' });
    assert.equal(description, '一只白色杯子位于画面中央，桌面是浅棕色。');
    assert.deepEqual(await store.list(), []);
  });
});

test('missing vision configuration prevents explicit save without leaving a partial item', async () => {
  await withFixture(async ({ attachment, store }) => {
    const core = createGalleryCore({ rootDir: store.rootDir, vision: {} });
    await assert.rejects(() => core.saveCyberbossAttachment(attachment, {
      title: '要保存的图片', firstImpression: '第一眼觉得很重要。', contextNote: '请记住这张',
    }), new RegExp(GALLERY_ERRORS.visionNotConfigured));
    assert.deepEqual(await core.store.list(), []);
  });
});

test('neutral vision reads current settings before each explicit save', async () => {
  await withFixture(async ({ attachment, sourcePath, store }) => {
    const rootDir = store.rootDir;
    const visionConfig = { baseUrl: 'https://vision.example/v1', apiKey: '', model: 'first-model', timeoutMs: 5000 };
    const settings = new GallerySettingsStore({ rootDir, defaults: visionConfig });
    const core = createGalleryCore({ rootDir, vision: visionConfig }, { getVisionConfig: () => settings.getVisionConfig() });
    const models = [];
    core.neutralVision.fetchImpl = async (_url, options) => {
      models.push(JSON.parse(options.body).model);
      return new Response(JSON.stringify({ choices: [{ message: { content: '直接可见的一组图像事实描述。' } }] }), { status: 200 });
    };
    await core.saveCyberbossAttachment(attachment, {
      title: '第一张', firstImpression: '第一眼', contextNote: '第一次',
    });
    await settings.saveVisionSettings({ baseUrl: 'https://vision.example/v1', model: 'next-model', timeoutMs: 5000, apiKey: '' });
    await writeFile(sourcePath, pngBytes('second distinct image'));
    await core.saveCyberbossAttachment(attachment, {
      title: '第二张', firstImpression: '第二眼', contextNote: '第二次',
    });
    assert.deepEqual(models, ['first-model', 'next-model']);
  });
});

test('explicit Core save calls NeutralVision before committing complete Gallery metadata', async () => {
  await withFixture(async ({ attachment, store }) => {
    const core = createGalleryCore({
      rootDir: store.rootDir,
      vision: { baseUrl: 'https://vision.example/v1', model: 'dsv4.1flash', timeoutMs: 5000 },
    });
    let request;
    core.neutralVision.fetchImpl = async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '蓝色天空上方有白云，绿色草地上有一个白色卡通形象。' } }] }), { status: 200 });
    };

    const result = await core.saveCyberbossAttachment(attachment, {
      title: '草地上的形象',
      firstImpression: '看见时觉得很安静。',
      contextNote: '帮我记住这张图',
    });

    assert.equal(result.created, true);
    assert.equal(request.url, 'https://vision.example/v1/chat/completions');
    assert.equal(request.body.model, 'dsv4.1flash');
    assert.equal(result.item.title, '草地上的形象');
    assert.equal(result.item.first_impression, '看见时觉得很安静。');
    assert.equal(result.item.first_context_note, '帮我记住这张图');
    assert.equal(result.item.first_description, '蓝色天空上方有白云，绿色草地上有一个白色卡通形象。');
    assert.equal((await core.store.list()).length, 1);
  });
});

test('vision API failure leaves no half-created Gallery item', async () => {
  await withFixture(async ({ attachment, store }) => {
    const core = createGalleryCore({
      rootDir: store.rootDir,
      vision: { baseUrl: 'https://vision.example/v1', model: 'dsv4.1flash', timeoutMs: 5000 },
    });
    core.neutralVision.fetchImpl = async () => new Response('{}', { status: 503 });

    await assert.rejects(() => core.saveCyberbossAttachment(attachment, {
      title: '要保存的图片', firstImpression: '第一眼觉得很特别。', contextNote: '请记住这张',
    }), /gallery_vision_request_failed:503/);
    assert.deepEqual(await core.store.list(), []);
    assert.deepEqual(await readdir(core.store.paths('0'.repeat(64)).images), []);
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
