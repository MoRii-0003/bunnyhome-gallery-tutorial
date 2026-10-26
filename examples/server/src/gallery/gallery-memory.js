import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';

const clean = (value, limit) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');

export class GalleryMemory {
  constructor(store) {
    this.store = store;
  }

  async renameTitle(id, title) {
    const nextTitle = clean(title, 60);
    if (!nextTitle) throw galleryError(GALLERY_ERRORS.titleRequired);
    return this.store.updateMetadata(id, (current) => ({ ...current, title: nextTitle }));
  }

  async recordSharedView(id, requestId) {
    return this.store.updateMetadata(id, (current) => {
      const priorIds = Array.isArray(current.shared_view_request_ids) ? current.shared_view_request_ids : [];
      if (priorIds.includes(requestId)) return current;
      return {
        ...current,
        seen_count: Number(current.seen_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
        shared_view_request_ids: [...priorIds, requestId],
      };
    });
  }

  async deleteItem(id) {
    return this.store.delete(id);
  }
}
