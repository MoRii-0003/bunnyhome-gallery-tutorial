import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalGalleryStore } from '../src/gallery/local-gallery-store.js';
import { GalleryMemory } from '../src/gallery/gallery-memory.js';

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
  const store = new LocalGalleryStore({ rootDir, ...options.storeOptions });
  const memory = new GalleryMemory(store);
  let ingestInstance;
  const ingest = {
    async ingestCyberbossAttachment(...args) {
      if (!ingestInstance) {
        const { ImageIngest } = await import('../src/gallery/image-ingest.js');
        ingestInstance = new ImageIngest({ store, ...options.ingestOptions });
      }
      return ingestInstance.ingestCyberbossAttachment(...args);
    },
    async lookupExistingCyberbossAttachment(...args) {
      if (!ingestInstance) {
        const { ImageIngest } = await import('../src/gallery/image-ingest.js');
        ingestInstance = new ImageIngest({ store, ...options.ingestOptions });
      }
      return ingestInstance.lookupExistingCyberbossAttachment(...args);
    },
    async saveCyberbossAttachment(...args) {
      if (!ingestInstance) {
        const { ImageIngest } = await import('../src/gallery/image-ingest.js');
        ingestInstance = new ImageIngest({ store, ...options.ingestOptions });
      }
      return ingestInstance.saveCyberbossAttachment(...args);
    },
  };
  const attachment = {
    absolutePath: sourcePath,
    contentType: 'image/jpeg',
    kind: 'image',
    sourceKind: 'photo',
    isImage: true,
  };
  return {
    directory, rootDir, sourcePath, store, memory, ingest, attachment,
    async cleanup() { await rm(directory, { recursive: true, force: true }); },
  };
}
