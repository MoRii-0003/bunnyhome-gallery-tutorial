import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';

const clean = (value, limit) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');

export class GalleryMemory {
  constructor(store) {
    this.store = store;
  }

  async setCompanionMemory(id, { title, firstImpression, contextNote } = {}) {
    return this.store.updateMetadata(id, (current) => {
      const next = { ...current };
      if (!current.title && title !== undefined) next.title = clean(title, 60);
      if (!current.first_impression && firstImpression !== undefined) {
        next.first_impression = clean(firstImpression, 800);
      }
      if (!current.first_context_note && contextNote !== undefined) {
        next.first_context_note = clean(contextNote, 600);
      }
      return next;
    });
  }

  async setFirstDescription(id, description) {
    const cleanDescription = clean(description, 1200);
    if (!cleanDescription) throw galleryError(GALLERY_ERRORS.descriptionRequired);
    return this.store.updateMetadata(id, (current) => {
      if (current.first_description) return current;
      return { ...current, first_description: cleanDescription };
    });
  }
}
