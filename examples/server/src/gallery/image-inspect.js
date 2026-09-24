import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';

export const MAX_GALLERY_IMAGE_BYTES = 10 * 1024 * 1024;

function inspectMagic(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mediaType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mediaType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mediaType: 'image/webp', extension: 'webp' };
  }
  return null;
}

export function inspectImage(buffer, maxBytes = MAX_GALLERY_IMAGE_BYTES) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxBytes) {
    throw galleryError(GALLERY_ERRORS.imageTooLarge);
  }
  const type = inspectMagic(buffer);
  if (!type) throw galleryError(GALLERY_ERRORS.unsupportedImage);
  return type;
}
