import path from 'node:path';
import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';

const extensions = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export function galleryPaths(rootDir, id, mediaType) {
  if (!/^[a-f0-9]{64}$/.test(String(id || ''))) throw galleryError(GALLERY_ERRORS.invalidId);
  const root = path.resolve(rootDir);
  const extension = extensions[mediaType];
  return {
    root,
    images: path.join(root, 'images'),
    image: extension ? path.join(root, 'images', `${id}.${extension}`) : null,
    meta: path.join(root, 'meta'),
    metadata: path.join(root, 'meta', `${id}.json`),
    claims: path.join(root, 'claims'),
    claim: path.join(root, 'claims', `${id}.json`),
  };
}

export function galleryImagePath(rootDir, id, mediaType) {
  const image = galleryPaths(rootDir, id, mediaType).image;
  if (!image) throw galleryError(GALLERY_ERRORS.unsupportedImage);
  return image;
}
