import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { GALLERY_ERRORS } from '../src/gallery/gallery-errors.js';
import { galleryPaths } from '../src/gallery/gallery-paths.js';
import { makeGalleryFixture, pngBytes } from '../test-support/gallery-fixture.js';

async function withFixture(callback, options) {
  const fixture = await makeGalleryFixture(options);
  try { await callback(fixture); } finally { await fixture.cleanup(); }
}

test('first explicit save creates an item and repeat reuses its exact SHA id', async () => {
  await withFixture(async ({ saveAttachment, attachment }) => {
    const first = await saveAttachment(attachment);
    const second = await saveAttachment(attachment);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.item.id, first.item.content_hash);
    assert.match(first.item.id, /^[a-f0-9]{64}$/);
    assert.equal(first.item.media_type, 'image/png');
    assert.equal(first.item.storage_path, `images/${first.item.id}.png`);
    assert.equal(second.item.seen_count, 2);
    assert.equal(second.item.first_seen_at, first.item.first_seen_at);
  });
});

test('renaming the source file does not change the exact-binary SHA id', async () => {
  await withFixture(async ({ directory, saveAttachment, attachment }) => {
    const first = await saveAttachment(attachment);
    attachment.absolutePath = path.join(directory, '小叽.png');
    await writeFile(attachment.absolutePath, pngBytes());
    const second = await saveAttachment(attachment);
    assert.equal(second.created, false);
    assert.equal(second.item.id, first.item.id);
  });
});

test('native sticker attachments are skipped before path access', async () => {
  await withFixture(async ({ saveAttachment, attachment }) => {
    const result = await saveAttachment({ ...attachment, absolutePath: 'missing.jpg', sourceKind: 'sticker' });
    assert.deepEqual(result, { created: false, skipped: true, reason: GALLERY_ERRORS.nativeSticker, item: null });
  });
});

test('ordinary photo saves and actual magic type wins over supplied MIME', async () => {
  await withFixture(async ({ saveAttachment, attachment }) => {
    const result = await saveAttachment(attachment);
    assert.equal(result.created, true);
    assert.equal(result.item.source_kind, 'photo');
    assert.equal(result.item.media_type, 'image/png');
  });
});

test('JPEG, PNG, and WebP signatures determine the stored media type', async () => {
  const formats = [
    { bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]), type: 'image/jpeg' },
    { bytes: pngBytes(), type: 'image/png' },
    { bytes: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('fixture')]), type: 'image/webp' },
  ];
  for (const format of formats) {
    await withFixture(async ({ saveAttachment, attachment }) => {
      const result = await saveAttachment(attachment);
      assert.equal(result.item.media_type, format.type);
    }, { bytes: format.bytes });
  }
});

test('a file disguised as an image is rejected by magic inspection', async () => {
  await withFixture(async ({ directory, saveAttachment, attachment }) => {
    attachment.absolutePath = path.join(directory, 'fake.webp');
    await writeFile(attachment.absolutePath, Buffer.from('not an image'));
    await assert.rejects(() => saveAttachment(attachment), /gallery_image_type_unsupported/);
  });
});

test('concurrent same-SHA saves create only one metadata file', async () => {
  await withFixture(async ({ saveAttachment, attachment, rootDir }) => {
    const results = await Promise.all([
      saveAttachment(attachment),
      saveAttachment(attachment),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => !result.created).length, 1);
    assert.equal((await readdir(path.join(rootDir, 'meta'))).length, 1);
    assert.equal(results[0].item.id, results[1].item.id);
    assert.equal(Math.max(results[0].item.seen_count, results[1].item.seen_count), 2);
  });
});

test('stale save claims are recovered for the same content hash', async () => {
  await withFixture(async ({ saveAttachment, attachment, rootDir, sourcePath }) => {
    const id = crypto.createHash('sha256').update(await readFile(sourcePath)).digest('hex');
    const paths = galleryPaths(rootDir, id, 'image/png');
    await mkdir(paths.claims, { recursive: true });
    await mkdir(paths.images, { recursive: true });
    await writeFile(paths.image, await readFile(sourcePath));
    await writeFile(paths.claim, JSON.stringify({ token: 'stale', created_at: '2000-01-01T00:00:00.000Z' }));
    const results = await Promise.all([
      saveAttachment(attachment),
      saveAttachment(attachment),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => !result.created).length, 1);
    await assert.rejects(() => readFile(paths.claim), { code: 'ENOENT' });
  });
});

test('repeat save preserves first memory and description while updating seen count', async () => {
  await withFixture(async ({ core, saveAttachment, attachment }) => {
    core.neutralVision.describeImage = async () => '第一张图的客观视觉描述';
    const first = await saveAttachment(attachment, {
      title: '第一次', firstImpression: '第一眼', contextNote: '原始上下文',
    });
    core.neutralVision.describeImage = async () => '不应覆盖的后续描述';
    const second = await saveAttachment(attachment, {
      title: '后来的标题', firstImpression: '后来的印象', contextNote: '后来的上下文',
    });
    assert.equal(second.item.title, '第一次');
    assert.equal(second.item.first_impression, '第一眼');
    assert.equal(second.item.first_description, '第一张图的客观视觉描述');
    assert.equal(second.item.first_context_note, '原始上下文');
    assert.equal(second.item.first_seen_at, first.item.first_seen_at);
    assert.equal(second.item.seen_count, 2);
  });
});

test('read-only lookup finds an existing image without changing metadata or creating records', async () => {
  await withFixture(async ({ core, saveAttachment, attachment, store, rootDir }) => {
    const saved = (await saveAttachment(attachment)).item;
    const original = await store.get(saved.id);
    const result = await core.lookupExistingCyberbossAttachment(attachment);
    assert.equal(result.found, true);
    assert.equal(result.id, saved.id);
    assert.deepEqual(result.item, original);
    assert.deepEqual(await readdir(path.join(rootDir, 'meta')), [`${saved.id}.json`]);
    assert.equal((await store.get(saved.id)).seen_count, 1);
  });
});

test('read-only lookup of a new image returns no item and does not create Gallery files', async () => {
  await withFixture(async ({ core, attachment, rootDir }) => {
    const result = await core.lookupExistingCyberbossAttachment(attachment);
    assert.deepEqual(result, { found: false, skipped: false, id: result.id, item: null });
    assert.match(result.id, /^[a-f0-9]{64}$/);
    assert.deepEqual(await readdir(path.join(rootDir, 'meta')).catch(() => []), []);
    assert.deepEqual(await readdir(path.join(rootDir, 'images')).catch(() => []), []);
    assert.deepEqual(await readdir(path.join(rootDir, 'claims')).catch(() => []), []);
  });
});

test('explicit save writes first memory and neutral description before creating the item', async () => {
  await withFixture(async ({ core, saveAttachment, attachment, rootDir }) => {
    let visionCalls = 0;
    core.neutralVision.describeImage = async ({ bytes, mediaType }) => {
      visionCalls += 1;
      assert.ok(bytes.length > 0);
      assert.equal(mediaType, 'image/png');
      return '绿色草地上有一个白色卡通人物，天空为蓝色。';
    };
    const result = await saveAttachment(attachment, {
      title: '草地上的小人', firstImpression: '第一眼觉得它很安静。', contextNote: '这张对我很重要',
    });

    assert.equal(result.created, true);
    assert.equal(visionCalls, 1);
    assert.equal(result.item.title, '草地上的小人');
    assert.equal(result.item.first_impression, '第一眼觉得它很安静。');
    assert.equal(result.item.first_context_note, '这张对我很重要');
    assert.equal(result.item.first_description, '绿色草地上有一个白色卡通人物，天空为蓝色。');
    assert.equal((await readdir(path.join(rootDir, 'meta'))).length, 1);
  });
});

test('neutral vision failure does not leave a new image or metadata record', async () => {
  await withFixture(async ({ core, saveAttachment, attachment, rootDir }) => {
    core.neutralVision.describeImage = async () => { throw new Error('vision offline'); };
    await assert.rejects(() => saveAttachment(attachment, {
      title: '要保存的图', firstImpression: '想把它留下。', contextNote: '重要图片',
    }), /vision offline/);
    assert.deepEqual(await readdir(path.join(rootDir, 'meta')).catch(() => []), []);
    assert.deepEqual(await readdir(path.join(rootDir, 'images')).catch(() => []), []);
  });
});

test('explicitly saving the same SHA reuses its record without repeating neutral vision', async () => {
  await withFixture(async ({ core, saveAttachment, attachment }) => {
    let visionCalls = 0;
    core.neutralVision.describeImage = async () => { visionCalls += 1; return '画面中有一个白色主体，背景为绿色。'; };
    const first = await saveAttachment(attachment, {
      title: '初始标题', firstImpression: '第一眼印象。', contextNote: '第一次上下文',
    });
    const second = await saveAttachment(attachment, {
      title: '不覆盖标题', firstImpression: '不覆盖印象。', contextNote: '不覆盖上下文',
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.item.id, first.item.id);
    assert.equal(second.item.seen_count, 2);
    assert.equal(second.item.title, '初始标题');
    assert.equal(second.item.first_impression, '第一眼印象。');
    assert.equal(second.item.first_context_note, '第一次上下文');
    assert.equal(visionCalls, 1);
  });
});
