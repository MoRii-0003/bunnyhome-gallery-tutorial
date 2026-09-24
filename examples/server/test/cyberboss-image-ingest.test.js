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

test('first ingest creates true and a repeat returns false with the same SHA id', async () => {
  await withFixture(async ({ ingest, attachment }) => {
    const first = await ingest.ingestCyberbossAttachment(attachment);
    const second = await ingest.ingestCyberbossAttachment(attachment);
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
  await withFixture(async ({ directory, ingest, attachment }) => {
    const first = await ingest.ingestCyberbossAttachment(attachment);
    attachment.absolutePath = path.join(directory, '小叽.png');
    await writeFile(attachment.absolutePath, pngBytes());
    const second = await ingest.ingestCyberbossAttachment(attachment);
    assert.equal(second.created, false);
    assert.equal(second.item.id, first.item.id);
  });
});

test('native sticker attachments are skipped before path access', async () => {
  await withFixture(async ({ ingest, attachment }) => {
    const result = await ingest.ingestCyberbossAttachment({ ...attachment, absolutePath: 'missing.jpg', sourceKind: 'sticker' });
    assert.deepEqual(result, { created: false, skipped: true, reason: GALLERY_ERRORS.nativeSticker, item: null });
  });
});

test('ordinary photo ingests and actual magic type wins over supplied MIME', async () => {
  await withFixture(async ({ ingest, attachment }) => {
    const result = await ingest.ingestCyberbossAttachment(attachment);
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
    await withFixture(async ({ ingest, attachment }) => {
      const result = await ingest.ingestCyberbossAttachment(attachment);
      assert.equal(result.item.media_type, format.type);
    }, { bytes: format.bytes });
  }
});

test('a file disguised as an image is rejected by magic inspection', async () => {
  await withFixture(async ({ directory, ingest, attachment }) => {
    attachment.absolutePath = path.join(directory, 'fake.webp');
    await writeFile(attachment.absolutePath, Buffer.from('not an image'));
    await assert.rejects(() => ingest.ingestCyberbossAttachment(attachment), /gallery_image_type_unsupported/);
  });
});

test('concurrent same-SHA ingests create only one metadata file', async () => {
  await withFixture(async ({ ingest, attachment, rootDir }) => {
    const results = await Promise.all([
      ingest.ingestCyberbossAttachment(attachment),
      ingest.ingestCyberbossAttachment(attachment),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => !result.created).length, 1);
    assert.equal((await readdir(path.join(rootDir, 'meta'))).length, 1);
    assert.equal(results[0].item.id, results[1].item.id);
    assert.equal(Math.max(results[0].item.seen_count, results[1].item.seen_count), 2);
  });
});

test('stale ingest claims are recovered for the same content hash', async () => {
  await withFixture(async ({ ingest, attachment, rootDir, sourcePath }) => {
    const id = crypto.createHash('sha256').update(await readFile(sourcePath)).digest('hex');
    const paths = galleryPaths(rootDir, id, 'image/png');
    await mkdir(paths.claims, { recursive: true });
    await mkdir(paths.images, { recursive: true });
    await writeFile(paths.image, await readFile(sourcePath));
    await writeFile(paths.claim, JSON.stringify({ token: 'stale', created_at: '2000-01-01T00:00:00.000Z' }));
    const results = await Promise.all([
      ingest.ingestCyberbossAttachment(attachment),
      ingest.ingestCyberbossAttachment(attachment),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => !result.created).length, 1);
    await assert.rejects(() => readFile(paths.claim), { code: 'ENOENT' });
  });
});

test('repeat seen leaves first companion memory and description untouched', async () => {
  await withFixture(async ({ ingest, attachment, memory }) => {
    const first = (await ingest.ingestCyberbossAttachment(attachment)).item;
    await memory.setCompanionMemory(first.id, { title: '第一次', firstImpression: '第一眼', contextNote: '原始上下文' });
    await memory.setFirstDescription(first.id, '第一张图的客观视觉描述');
    const second = await ingest.ingestCyberbossAttachment(attachment);
    assert.equal(second.item.title, '第一次');
    assert.equal(second.item.first_impression, '第一眼');
    assert.equal(second.item.first_description, '第一张图的客观视觉描述');
    assert.equal(second.item.first_context_note, '原始上下文');
    assert.equal(second.item.first_seen_at, first.first_seen_at);
    assert.equal(second.item.seen_count, 2);
  });
});
