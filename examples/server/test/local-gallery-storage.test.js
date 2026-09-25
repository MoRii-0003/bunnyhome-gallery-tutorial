import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { copyFile, link, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { GalleryMemory } from '../src/gallery/gallery-memory.js';
import { LocalGalleryStore } from '../src/gallery/local-gallery-store.js';
import { galleryImagePath, galleryPaths } from '../src/gallery/gallery-paths.js';
import { makeGalleryFixture, pngBytes } from '../test-support/gallery-fixture.js';

async function withFixture(callback) {
  const fixture = await makeGalleryFixture();
  try { await callback(fixture); } finally { await fixture.cleanup(); }
}

test('hard link is the preferred persistence strategy', async () => {
  await withFixture(async ({ sourcePath, rootDir, store }) => {
    const bytes = await readFile(sourcePath);
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const result = await store.persistImage(sourcePath, id, 'image/png', bytes);
    assert.equal(result.mode, 'linked');
    const destination = galleryImagePath(rootDir, id, 'image/png');
    const [source, stored] = await Promise.all([stat(sourcePath), stat(destination)]);
    assert.equal(source.dev, stored.dev);
    assert.equal(source.ino, stored.ino);
  });
});

test('hard link failure falls back to a file copy', async () => {
  await withFixture(async ({ sourcePath, rootDir }) => {
    const bytes = await readFile(sourcePath);
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    const store = new LocalGalleryStore({
      rootDir,
      fileLink: async () => { throw Object.assign(new Error('cross device'), { code: 'EXDEV' }); },
      fileCopy: copyFile,
    });
    const result = await store.persistImage(sourcePath, id, 'image/png', bytes);
    assert.equal(result.mode, 'copied');
    assert.deepEqual(await readFile(result.path), pngBytes());
  });
});

test('a source change during linking stores the exact bytes that were hashed', async () => {
  await withFixture(async ({ sourcePath, rootDir }) => {
    const original = await readFile(sourcePath);
    const id = crypto.createHash('sha256').update(original).digest('hex');
    const store = new LocalGalleryStore({
      rootDir,
      fileLink: async (source, destination) => {
        await writeFile(source, pngBytes('changed after hash'));
        await link(source, destination);
      },
    });
    const result = await store.persistImage(sourcePath, id, 'image/png', original);
    assert.equal(result.mode, 'copied');
    assert.deepEqual(await readFile(result.path), original);
  });
});

test('stale wx claims can be recovered', async () => {
  await withFixture(async ({ rootDir, store }) => {
    const id = 'c'.repeat(64);
    const paths = galleryPaths(rootDir, id);
    await mkdir(paths.claims, { recursive: true });
    await writeFile(paths.claim, JSON.stringify({ token: 'stale', created_at: '2000-01-01T00:00:00.000Z' }));
    const token = await store.acquireClaim(id);
    await store.releaseClaim(id, token);
    await assert.rejects(() => readFile(paths.claim), { code: 'ENOENT' });
  });
});

test('setCompanionMemory fills companion-owned first memory fields once', async () => {
  await withFixture(async ({ store }) => {
    const id = 'd'.repeat(64);
    const original = {
      id, content_hash: id, storage_path: `images/${id}.png`, media_type: 'image/png', source_kind: 'photo',
      title: '', first_impression: '', first_description: '原有客观描述', first_context_note: '',
      first_seen_at: '2026-09-01T00:00:00.000Z', last_seen_at: '2026-09-02T00:00:00.000Z', seen_count: 4,
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z',
    };
    await store.writeMetadata(id, original);
    const memory = new GalleryMemory(store);
    const updated = await memory.setCompanionMemory(id, {
      title: '窗边', firstImpression: '第一眼的感觉', contextNote: '当时的对话',
    });
    assert.equal(updated.title, '窗边');
    assert.equal(updated.first_impression, '第一眼的感觉');
    assert.equal(updated.first_context_note, '当时的对话');
    const repeated = await memory.setCompanionMemory(id, {
      title: '覆盖标题', firstImpression: '覆盖印象', contextNote: '覆盖上下文',
    });
    assert.equal(repeated.title, '窗边');
    assert.equal(repeated.first_impression, '第一眼的感觉');
    assert.equal(repeated.first_context_note, '当时的对话');
    assert.equal(updated.first_description, original.first_description);
    assert.equal(updated.first_seen_at, original.first_seen_at);
    assert.equal(updated.last_seen_at, original.last_seen_at);
    assert.equal(updated.seen_count, original.seen_count);
    assert.equal(updated.source_kind, original.source_kind);
  });
});

test('store.list returns valid metadata only and sorts newest first', async () => {
  await withFixture(async ({ store }) => {
    const firstId = '1'.repeat(64);
    const secondId = '2'.repeat(64);
    await store.writeMetadata(firstId, { id: firstId, created_at: '2026-01-01T00:00:00.000Z' });
    await store.writeMetadata(secondId, { id: secondId, created_at: '2026-02-01T00:00:00.000Z' });
    const paths = galleryPaths(store.rootDir, firstId);
    await writeFile(path.join(paths.meta, 'broken.json'), '{');
    await writeFile(path.join(paths.meta, 'not-a-sha.json'), JSON.stringify({ id: 'not-a-sha' }));
    await writeFile(path.join(paths.meta, `${'3'.repeat(64)}.json.tmp`), '{}');
    await writeFile(path.join(paths.meta, `${'4'.repeat(64)}.json`), JSON.stringify({ id: '5'.repeat(64) }));
    assert.deepEqual((await store.list()).map((item) => item.id), [secondId, firstId]);
  });
});

test('renameTitle can overwrite only title', async () => {
  await withFixture(async ({ store }) => {
    const id = 'e'.repeat(64);
    const original = {
      id, title: '最初标题', first_impression: '第一印象', first_description: '中性描述', first_context_note: '当时语境',
    };
    await store.writeMetadata(id, original);
    const updated = await new GalleryMemory(store).renameTitle(id, '新标题');
    assert.equal(updated.title, '新标题');
    assert.equal(updated.first_impression, original.first_impression);
    assert.equal(updated.first_description, original.first_description);
    assert.equal(updated.first_context_note, original.first_context_note);
  });
});
