import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createGalleryCore } from '../src/gallery/index.js';
import { makeGalleryFixture } from '../test-support/gallery-fixture.js';

async function withFixture(callback, options = {}) {
  const fixture = await makeGalleryFixture(options);
  try { await callback(fixture); } finally { await fixture.cleanup(); }
}

test('createCandidate stores only the attachment contract and context under Gallery Root', async () => {
  await withFixture(async ({ core, attachment, rootDir }) => {
    const { created, candidateId } = await core.createCandidate(attachment, '  窗边的猫  ');
    const file = path.join(rootDir, 'candidates', `${candidateId}.json`);
    const candidate = JSON.parse(await readFile(file, 'utf8'));

    assert.equal(created, true);
    assert.match(candidateId, /^[a-f0-9-]{36}$/);
    assert.equal(candidate.attachment.absolutePath, attachment.absolutePath);
    assert.equal(candidate.contextNote, '窗边的猫');
    assert.equal(typeof candidate.createdAt, 'number');
    assert.equal(candidate.storageMode, undefined);
  });
});

test('saveCandidate saves complete memory and removes the candidate file', async () => {
  await withFixture(async ({ core, attachment, rootDir, store }) => {
    const { candidateId } = await core.createCandidate(attachment, '当时的文字上下文');
    const result = await core.saveCandidate(candidateId, { title: '窗边', firstImpression: '第一眼很安静。' });
    const item = (await store.list())[0];

    assert.deepEqual(result, { saved: true, id: item.id, created: true });
    assert.equal(item.title, '窗边');
    assert.equal(item.first_impression, '第一眼很安静。');
    assert.equal(item.first_context_note, '当时的文字上下文');
    assert.equal(item.first_description, '测试用中性视觉描述。');
    await assert.rejects(() => readFile(path.join(rootDir, 'candidates', `${candidateId}.json`)), { code: 'ENOENT' });
  });
});

test('a separate Gallery Core instance can read and save the candidate', async () => {
  await withFixture(async ({ core, attachment, directory, rootDir, store }) => {
    const { candidateId } = await core.createCandidate(attachment, '跨进程上下文');
    const toolCore = createGalleryCore({ rootDir, vision: {} }, { legacyStateDir: directory });
    toolCore.neutralVision.describeImage = async () => '另一进程写入的中性描述。';
    const result = await toolCore.saveCandidate(candidateId, { title: '分开的 Core', firstImpression: '我想把它留下。' });
    const item = (await store.list())[0];

    assert.deepEqual(result, { saved: true, id: item.id, created: true });
    assert.equal(item.first_context_note, '跨进程上下文');
    await assert.rejects(() => readFile(path.join(rootDir, 'candidates', `${candidateId}.json`)), { code: 'ENOENT' });
  });
});

test('expired Gallery Root candidates are pruned and cannot be saved after 24 hours', async () => {
  await withFixture(async ({ core, attachment, rootDir, store }) => {
    const { candidateId } = await core.createCandidate(attachment, '过期上下文');
    const file = path.join(rootDir, 'candidates', `${candidateId}.json`);
    const candidate = JSON.parse(await readFile(file, 'utf8'));
    candidate.createdAt = Date.now() - 24 * 60 * 60 * 1000 - 1;
    await writeFile(file, JSON.stringify(candidate));

    assert.deepEqual(await core.saveCandidate(candidateId, { title: '过期', firstImpression: '过期' }), {
      saved: false, reason: 'gallery_candidate_unavailable',
    });
    await assert.rejects(() => readFile(file), { code: 'ENOENT' });
    assert.deepEqual(await store.list(), []);
  });
});

test('valid legacy candidates migrate into Gallery Root and remain saveable', async () => {
  await withFixture(async ({ core, attachment, directory, rootDir, store }) => {
    const legacyDirectory = path.join(directory, 'gallery-candidates');
    const candidateId = '11111111-1111-4111-8111-111111111111';
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, `${candidateId}.json`), JSON.stringify({
      attachment, contextNote: '升级前的上下文', createdAt: Date.now(),
    }));

    const result = await core.saveCandidate(candidateId, { title: '迁移图片', firstImpression: '仍保留第一次印象。' });
    const item = (await store.list())[0];

    assert.deepEqual(result, { saved: true, id: item.id, created: true });
    assert.equal(item.first_context_note, '升级前的上下文');
    assert.equal(await store.get(item.id) !== null, true);
    await assert.rejects(() => readFile(path.join(legacyDirectory, `${candidateId}.json`)), { code: 'ENOENT' });
    await assert.rejects(() => readFile(path.join(rootDir, 'candidates', `${candidateId}.json`)), { code: 'ENOENT' });
    await assert.rejects(() => readdir(legacyDirectory), { code: 'ENOENT' });
  });
});

test('expired legacy candidates are removed instead of migrated', async () => {
  await withFixture(async ({ core, attachment, directory, rootDir }) => {
    const legacyDirectory = path.join(directory, 'gallery-candidates');
    const candidateId = '22222222-2222-4222-8222-222222222222';
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, `${candidateId}.json`), JSON.stringify({
      attachment, contextNote: '过期上下文', createdAt: Date.now() - 24 * 60 * 60 * 1000 - 1,
    }));

    const created = await core.createCandidate(attachment, '新候选');
    assert.equal(created.created, true);
    await assert.rejects(() => readFile(path.join(legacyDirectory, `${candidateId}.json`)), { code: 'ENOENT' });
    await assert.rejects(() => readFile(path.join(rootDir, 'candidates', `${candidateId}.json`)), { code: 'ENOENT' });
    await assert.rejects(() => readdir(legacyDirectory), { code: 'ENOENT' });
  });
});

test('legacy directory scan failures do not block creating and saving a new candidate', async () => {
  const warnings = [];
  await withFixture(async ({ core, attachment, store }) => {
    const { created, candidateId } = await core.createCandidate(attachment, '新候选上下文');
    assert.equal(created, true);

    const saved = await core.saveCandidate(candidateId, { title: '新候选', firstImpression: '仍可保存。' });
    assert.equal(saved.saved, true);
    assert.equal((await store.list()).length, 1);
  }, {
    legacyFs: { readdir: async () => { throw Object.assign(new Error('scan denied'), { code: 'EACCES' }); } },
    warn: (message) => warnings.push(message),
  });
  assert.ok(warnings.some((message) => message.includes('scan legacy candidates')));
});

test('legacy candidate copy failures do not block creating and saving a new candidate', async () => {
  const warnings = [];
  await withFixture(async ({ core, attachment, directory, store }) => {
    const legacyDirectory = path.join(directory, 'gallery-candidates');
    const legacyId = '33333333-3333-4333-8333-333333333333';
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, `${legacyId}.json`), JSON.stringify({
      attachment, contextNote: '仍留在旧目录', createdAt: Date.now(),
    }));

    const { created, candidateId } = await core.createCandidate(attachment, '新候选上下文');
    assert.equal(created, true);
    const saved = await core.saveCandidate(candidateId, { title: '新候选', firstImpression: '仍可保存。' });

    assert.equal(saved.saved, true);
    assert.equal((await store.list()).length, 1);
    assert.equal(JSON.parse(await readFile(path.join(legacyDirectory, `${legacyId}.json`), 'utf8')).contextNote, '仍留在旧目录');
  }, {
    legacyFs: { copyFile: async () => { throw Object.assign(new Error('copy denied'), { code: 'EACCES' }); } },
    warn: (message) => warnings.push(message),
  });
  assert.ok(warnings.some((message) => message.includes('copy legacy candidate')));
});

test('legacy source removal and empty-directory cleanup failures do not block candidate save', async () => {
  const warnings = [];
  const legacyId = '44444444-4444-4444-8444-444444444444';
  await withFixture(async ({ core, attachment, directory, rootDir, store }) => {
    const legacyDirectory = path.join(directory, 'gallery-candidates');
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, `${legacyId}.json`), JSON.stringify({
      attachment, contextNote: '迁移保留的上下文', createdAt: Date.now(),
    }));

    const { created, candidateId } = await core.createCandidate(attachment, '新候选上下文');
    assert.equal(created, true);
    const saved = await core.saveCandidate(candidateId, { title: '新候选', firstImpression: '仍可保存。' });
    const migratedSaved = await core.saveCandidate(legacyId, { title: '旧候选', firstImpression: '迁移删除失败也可保存。' });

    assert.equal(saved.saved, true);
    assert.equal(migratedSaved.saved, true);
    assert.equal((await store.list()).length, 1);
    await assert.rejects(() => readFile(path.join(rootDir, 'candidates', `${legacyId}.json`)), { code: 'ENOENT' });
    assert.ok(JSON.parse(await readFile(path.join(legacyDirectory, `${legacyId}.json`), 'utf8')));
    assert.ok(warnings.some((message) => message.includes('remove legacy candidate')));
    assert.ok(warnings.some((message) => message.includes('remove empty legacy candidate directory')));
  }, {
    legacyFs: {
      unlink: async (file) => {
        if (file.endsWith(`${legacyId}.json`)) throw Object.assign(new Error('remove denied'), { code: 'EACCES' });
        return unlink(file);
      },
      rmdir: async () => { throw Object.assign(new Error('directory remove denied'), { code: 'EACCES' }); },
    },
    warn: (message) => warnings.push(message),
  });
});

test('native stickers and invalid attachments never become candidates', async () => {
  await withFixture(async ({ core, attachment, rootDir }) => {
    assert.deepEqual(await core.createCandidate({ ...attachment, sourceKind: 'sticker' }, ''), {
      created: false, skipped: true, reason: 'native_sticker',
    });
    assert.equal((await core.createCandidate({ ...attachment, isImage: false, kind: 'text', contentType: 'text/plain' }, '')).created, false);
    assert.deepEqual(await readdir(path.join(rootDir, 'candidates')).catch(() => []), []);
  });
});
