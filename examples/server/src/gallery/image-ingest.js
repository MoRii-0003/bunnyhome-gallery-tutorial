import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isCyberbossImageAttachment, normalizeCyberbossImageAttachment } from '../adapters/cyberboss/image-attachment.js';
import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';
import { MAX_GALLERY_IMAGE_BYTES, inspectImage } from './image-inspect.js';

const clean = (value, limit) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');

async function inspectCyberbossAttachment(attachment, maxImageBytes) {
  if (!isCyberbossImageAttachment(attachment)) throw galleryError(GALLERY_ERRORS.attachmentNotImage);
  const sourceKind = typeof attachment?.sourceKind === 'string' ? attachment.sourceKind.trim() : '';
  if (sourceKind.toLowerCase() === 'sticker') return { skipped: true, reason: GALLERY_ERRORS.nativeSticker };

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
  if (!fileInfo.size || fileInfo.size > maxImageBytes) throw galleryError(GALLERY_ERRORS.imageTooLarge);
  const buffer = await readFile(normalized.absolutePath);
  const image = inspectImage(buffer, maxImageBytes);
  return {
    normalized,
    buffer,
    image,
    id: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

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
    const inspected = await inspectCyberbossAttachment(attachment, this.maxImageBytes);
    if (inspected.skipped) return { created: false, ...inspected, item: null };
    const { normalized, buffer, image, id } = inspected;
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

  async saveCyberbossAttachment(attachment, { title, firstImpression, contextNote } = {}, describeImage) {
    const inspected = await inspectCyberbossAttachment(attachment, this.maxImageBytes);
    if (inspected.skipped) return { created: false, ...inspected, item: null };
    const { normalized, buffer, image, id } = inspected;
    const firstMemory = {
      title: clean(title, 60),
      first_impression: clean(firstImpression, 800),
      first_context_note: clean(contextNote, 600),
    };
    if (!firstMemory.title) throw galleryError(GALLERY_ERRORS.titleRequired);
    if (!firstMemory.first_impression) throw galleryError(GALLERY_ERRORS.firstImpressionRequired);
    if (typeof describeImage !== 'function') throw galleryError(GALLERY_ERRORS.visionNotConfigured);

    const token = await this.store.acquireClaim(id);
    let persistedMode = '';
    try {
      const existing = await this.store.get(id);
      let description = existing?.first_description || '';
      if (!description) {
        const result = await describeImage({ bytes: buffer, mediaType: image.mediaType });
        if (result?.skipped) throw galleryError(result.reason || GALLERY_ERRORS.visionNotConfigured);
        description = clean(result, 1200);
        if (!description) throw galleryError(GALLERY_ERRORS.descriptionRequired);
      }

      const now = new Date().toISOString();
      if (existing) {
        const item = await this.store.writeMetadata(id, {
          ...existing,
          ...firstMemory,
          title: existing.title || firstMemory.title,
          first_impression: existing.first_impression || firstMemory.first_impression,
          first_context_note: existing.first_context_note || firstMemory.first_context_note,
          first_description: existing.first_description || description,
          last_seen_at: now,
          seen_count: Number(existing.seen_count || 0) + 1,
          updated_at: now,
        });
        return { created: false, skipped: false, item };
      }

      const stored = await this.store.persistImage(normalized.absolutePath, id, image.mediaType, buffer);
      persistedMode = stored.mode;
      const item = {
        ...createBaseGalleryMemory({ id, mediaType: image.mediaType, sourceKind: normalized.sourceKind, extension: image.extension, now }),
        ...firstMemory,
        first_description: description,
      };
      await this.store.writeMetadata(id, item);
      return { created: true, skipped: false, item, storageMode: stored.mode };
    } catch (error) {
      if (persistedMode && persistedMode !== 'existing' && !(await this.store.get(id).catch(() => null))) {
        await this.store.removeImage(id, image.mediaType).catch(() => {});
      }
      throw error;
    } finally {
      await this.store.releaseClaim(id, token);
    }
  }
}
