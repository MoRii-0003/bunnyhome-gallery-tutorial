const isAbsoluteLocalPath = (value) => /^[a-z]:[\\/]/i.test(value)
  || (value.startsWith('/') && !value.startsWith('//'));

export function isCyberbossImageAttachment(attachment) {
  const mediaType = String(attachment?.contentType || attachment?.mimeType || '').split(';', 1)[0].trim().toLowerCase();
  return attachment?.isImage === true
    || String(attachment?.kind || '').trim().toLowerCase() === 'image'
    || mediaType.startsWith('image/');
}

export function normalizeCyberbossImageAttachment(attachment) {
  const absolutePath = typeof attachment?.absolutePath === 'string' ? attachment.absolutePath.trim() : '';
  const mediaType = String(attachment?.contentType || attachment?.mimeType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (!isCyberbossImageAttachment(attachment)) throw new Error('cyberboss_attachment_not_image');
  if (!absolutePath || !isAbsoluteLocalPath(absolutePath)) {
    throw new Error('cyberboss_attachment_absolute_path_required');
  }
  if (!mediaType.startsWith('image/')) throw new Error('cyberboss_image_media_type_required');

  return {
    absolutePath,
    mediaType,
    sourceKind: typeof attachment.sourceKind === 'string' && attachment.sourceKind.trim()
      ? attachment.sourceKind.trim()
      : 'unknown',
  };
}
