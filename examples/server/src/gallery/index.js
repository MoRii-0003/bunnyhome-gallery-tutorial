import { ImageIngest } from './image-ingest.js';
import { GalleryMemory } from './gallery-memory.js';
import { LocalGalleryStore } from './local-gallery-store.js';
import { NeutralVision } from './neutral-vision.js';
import { loadGalleryConfig } from './gallery-config.js';

export { ImageIngest, GalleryMemory, LocalGalleryStore, NeutralVision, loadGalleryConfig };

export function createGalleryCore(config = loadGalleryConfig()) {
  const store = new LocalGalleryStore({ rootDir: config.rootDir });
  const memory = new GalleryMemory(store);
  const ingest = new ImageIngest({ store });
  const neutralVision = new NeutralVision({ store, memory, config: config.vision });
  return { store, memory, ingest, neutralVision };
}
