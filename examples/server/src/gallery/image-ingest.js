import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isCyberbossImageAttachment, normalizeCyberbossImageAttachment } from '../adapters/cyberboss/image-attachment.js';
import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';
import { MAX_GALLERY_IMAGE_BYTES, inspectImage } from './image-inspect.js';

export function createBaseGalleryMemory({ id, mediaType, sourceKind, extension, now = new Date().toISOString() }) {
  return {
    id,
    content_hash: id,
    storage_path: `images/${id}.${extension}`,
    media_type: mediaType,
    source_kind: sourceKind,
    title: '',
    first_impression: '',
    first_description: '',
    first_context_note: '',
    first_seen_at: now,
    last_seen_at: now,
    seen_count: 1,
    created_at: now,
    updated_at: now,
  };
}

export class ImageIngest {
  constructor({ store, maxImageBytes = MAX_GALLERY_IMAGE_BYTES }) {
    this.store = store;
    this.maxImageBytes = maxImageBytes;
  }

  async ingestCyberbossAttachment(attachment) {
    if (!isCyberbossImageAttachment(attachment)) throw galleryError(GALLERY_ERRORS.attachmentNotImage);
    const sourceKind = typeof attachment?.sourceKind === 'string' ? attachment.sourceKind.trim() : '';
    if (sourceKind.toLowerCase() === 'sticker') {
      return { created: false, skipped: true, reason: GALLERY_ERRORS.nativeSticker, item: null };
    }

    let normalized;
    try {
      normalized = normalizeCyberbossImageAttachment(attachment);
    } catch (error) {
      const adapterErrors = {
        cyberboss_attachment_not_image: GALLERY_ERRORS.attachmentNotImage,
        cyberboss_attachment_absolute_path_required: GALLERY_ERRORS.attachmentPathRequired,
        cyberboss_image_media_type_required: GALLERY_ERRORS.attachmentMimeRequired,
      };
      throw galleryError(adapterErrors[error?.message] || GALLERY_ERRORS.attachmentNotImage);
    }

    const fileInfo = await stat(normalized.absolutePath);
    if (!fileInfo.isFile()) throw galleryError(GALLERY_ERRORS.unsupportedImage);
    if (!fileInfo.size || fileInfo.size > this.maxImageBytes) throw galleryError(GALLERY_ERRORS.imageTooLarge);
    const buffer = await readFile(normalized.absolutePath);
    const image = inspectImage(buffer, this.maxImageBytes);
    const id = crypto.createHash('sha256').update(buffer).digest('hex');
    const token = await this.store.acquireClaim(id);
    let persisted = false;
    try {
      const existing = await this.store.get(id);
      if (existing) {
        const item = await this.store.writeMetadata(id, {
          ...existing,
          last_seen_at: new Date().toISOString(),
          seen_count: Number(existing.seen_count || 0) + 1,
          updated_at: new Date().toISOString(),
        });
        return { created: false, skipped: false, item };
      }

      const stored = await this.store.persistImage(normalized.absolutePath, id, image.mediaType, buffer);
      persisted = true;
      const item = createBaseGalleryMemory({
        id,
        mediaType: image.mediaType,
        sourceKind: normalized.sourceKind,
        extension: image.extension,
      });
      await this.store.writeMetadata(id, item);
      return { created: true, skipped: false, item, storageMode: stored.mode };
    } catch (error) {
      if (persisted && !(await this.store.get(id).catch(() => null))) {
        await this.store.removeImage(id, image.mediaType).catch(() => {});
      }
      throw error;
    } finally {
      await this.store.releaseClaim(id, token);
    }
  }
}
