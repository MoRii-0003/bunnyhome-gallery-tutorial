export const GALLERY_ERRORS = Object.freeze({
  invalidId: 'gallery_invalid_id',
  attachmentNotImage: 'gallery_attachment_not_image',
  nativeSticker: 'native_sticker',
  attachmentPathRequired: 'gallery_attachment_absolute_path_required',
  attachmentMimeRequired: 'gallery_attachment_image_mime_required',
  imageTooLarge: 'gallery_image_too_large',
  unsupportedImage: 'gallery_image_type_unsupported',
  itemNotFound: 'gallery_item_not_found',
  claimTimeout: 'gallery_claim_timeout',
  imageStorageConflict: 'gallery_image_storage_conflict',
  descriptionRequired: 'gallery_description_required',
  visionNotConfigured: 'vision_not_configured',
});

export function galleryError(code) {
  return Object.assign(new Error(code), { code });
}
