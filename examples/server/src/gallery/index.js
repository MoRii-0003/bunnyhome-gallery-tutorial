import { ImageIngest } from './image-ingest.js';
import { GalleryMemory } from './gallery-memory.js';
import { LocalGalleryStore } from './local-gallery-store.js';
import { NeutralVision } from './neutral-vision.js';
import { loadGalleryConfig } from './gallery-config.js';
import { GallerySettingsStore } from './gallery-settings-store.js';
import { GalleryCandidates } from './gallery-candidates.js';

export { GalleryMemory, GallerySettingsStore, LocalGalleryStore, NeutralVision, loadGalleryConfig };

export function createGalleryCore(config = loadGalleryConfig(), { getVisionConfig, legacyStateDir } = {}) {
  const store = new LocalGalleryStore({ rootDir: config.rootDir });
  const memory = new GalleryMemory(store);
  const ingest = new ImageIngest({ store });
  const candidates = new GalleryCandidates({ rootDir: config.rootDir, legacyStateDir });
  const settings = new GallerySettingsStore({ rootDir: config.rootDir, defaults: config.vision });
  const neutralVision = new NeutralVision({
    config: config.vision, getConfig: getVisionConfig || (() => settings.getVisionConfig()),
  });
  return {
    store,
    memory,
    neutralVision,
    createCandidate: (attachment, contextNote) => candidates.create(attachment, contextNote),
    async saveCandidate(candidateId, { title, firstImpression } = {}) {
      const candidate = await candidates.read(candidateId);
      if (!candidate) return { saved: false, reason: 'gallery_candidate_unavailable' };
      const result = await ingest.saveCyberbossAttachment(candidate.attachment, {
        title,
        firstImpression,
        contextNote: candidate.contextNote,
      }, (image) => neutralVision.describeImage(image));
      if (result?.skipped || !result?.item) {
        return { saved: false, reason: result?.reason || 'gallery_save_failed' };
      }
      await candidates.remove(candidateId);
      return { saved: true, id: result.item.id, created: result.created === true };
    },
    lookupExistingCyberbossAttachment: (attachment) => ingest.lookupExistingCyberbossAttachment(attachment),
    saveCyberbossAttachment: (attachment, firstMemory) => ingest.saveCyberbossAttachment(
      attachment,
      firstMemory,
      (image) => neutralVision.describeImage(image),
    ),
  };
}
