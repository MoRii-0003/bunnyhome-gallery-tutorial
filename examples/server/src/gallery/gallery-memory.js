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

  async deleteItem(id) {
    return this.store.delete(id);
  }
}
