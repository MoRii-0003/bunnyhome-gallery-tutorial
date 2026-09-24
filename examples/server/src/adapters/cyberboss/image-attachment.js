import path from 'node:path';

const isAbsoluteLocalPath = (value) => path.posix.isAbsolute(value)
  || path.win32.isAbsolute(value);

export function normalizeCyberbossImageAttachment(attachment) {
  const absolutePath = typeof attachment?.absolutePath === 'string' ? attachment.absolutePath.trim() : '';
  const mediaType = String(attachment?.contentType || attachment?.mimeType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const isImage = attachment?.isImage === true
    || String(attachment?.kind || '').trim().toLowerCase() === 'image'
    || mediaType.startsWith('image/');

  if (!isImage) throw new Error('cyberboss_attachment_not_image');
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
