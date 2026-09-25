import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';

const clean = (value, limit) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');

export class GalleryMemory {
  constructor(store) {
    this.store = store;
  }

  async setCompanionMemory(id, { title, firstImpression, contextNote } = {}) {
    return this.store.updateMetadata(id, (current) => {
      const next = { ...current };
      if (!String(current.title || '').trim() && title !== undefined) next.title = clean(title, 60);
      if (!String(current.first_impression || '').trim() && firstImpression !== undefined) {
        next.first_impression = clean(firstImpression, 800);
      }
      if (!String(current.first_context_note || '').trim() && contextNote !== undefined) {
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

  async renameTitle(id, title) {
    const nextTitle = clean(title, 60);
    if (!nextTitle) throw galleryError(GALLERY_ERRORS.titleRequired);
    return this.store.updateMetadata(id, (current) => ({ ...current, title: nextTitle }));
  }

  async deleteItem(id) {
    return this.store.delete(id);
  }
}
