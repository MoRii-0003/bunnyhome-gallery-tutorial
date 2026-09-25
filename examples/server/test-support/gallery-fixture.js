import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGalleryCore } from '../src/gallery/index.js';

export function pngBytes(label = 'fixture') {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from(label),
  ]);
}

export async function makeGalleryFixture(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gallery-core-'));
  const rootDir = path.join(directory, 'gallery');
  const sourcePath = path.join(directory, 'image.jpg');
  await writeFile(sourcePath, options.bytes || pngBytes());
  const core = createGalleryCore({
    rootDir,
    vision: { baseUrl: 'https://vision.fixture/v1', model: 'fixture-model', timeoutMs: 5000 },
  });
  core.neutralVision.describeImage = async () => '测试用中性视觉描述。';
  const attachment = {
    absolutePath: sourcePath,
    contentType: 'image/jpeg',
    kind: 'image',
    sourceKind: 'photo',
    isImage: true,
  };
  return {
    directory, rootDir, sourcePath, store: core.store, memory: core.memory, core, attachment,
    async saveAttachment(image = attachment, fields = {}) {
      return core.saveCyberbossAttachment(image, {
        title: '测试图片', firstImpression: '测试第一印象。', contextNote: '测试上下文。',
        ...fields,
      });
    },
    async cleanup() { await rm(directory, { recursive: true, force: true }); },
  };
}
