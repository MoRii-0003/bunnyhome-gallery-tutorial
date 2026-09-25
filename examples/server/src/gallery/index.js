import { ImageIngest } from './image-ingest.js';
import { GalleryMemory } from './gallery-memory.js';
import { LocalGalleryStore } from './local-gallery-store.js';
import { NeutralVision } from './neutral-vision.js';
import { loadGalleryConfig } from './gallery-config.js';
import { GallerySettingsStore } from './gallery-settings-store.js';

export { GalleryMemory, GallerySettingsStore, LocalGalleryStore, NeutralVision, loadGalleryConfig };

export function createGalleryCore(config = loadGalleryConfig(), { getVisionConfig } = {}) {
  const store = new LocalGalleryStore({ rootDir: config.rootDir });
  const memory = new GalleryMemory(store);
  const ingest = new ImageIngest({ store });
  const settings = new GallerySettingsStore({ rootDir: config.rootDir, defaults: config.vision });
  const neutralVision = new NeutralVision({
    config: config.vision, getConfig: getVisionConfig || (() => settings.getVisionConfig()),
  });
  return {
    store,
    memory,
    neutralVision,
    lookupExistingCyberbossAttachment: (attachment) => ingest.lookupExistingCyberbossAttachment(attachment),
    saveCyberbossAttachment: (attachment, firstMemory) => ingest.saveCyberbossAttachment(
      attachment,
      firstMemory,
      (image) => neutralVision.describeImage(image),
    ),
  };
}
