import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCyberbossImageAttachment } from '../src/adapters/cyberboss/image-attachment.js';

test('normalizes a Cyberboss image using contentType and accepts a Windows path', () => {
  assert.deepEqual(normalizeCyberbossImageAttachment({
    absolutePath: 'C:\\gallery\\photo.webp',
    contentType: 'image/webp; charset=binary',
    kind: 'image',
    sourceKind: 'photo',
    isImage: true,
  }), {
    absolutePath: 'C:\\gallery\\photo.webp',
    mediaType: 'image/webp',
    sourceKind: 'photo',
  });
});

test('normalizes a Cyberboss image using mimeType and accepts a Linux path', () => {
  assert.deepEqual(normalizeCyberbossImageAttachment({
    absolutePath: '/var/lib/gallery/image.bin',
    mimeType: 'image/png',
    kind: 'image',
  }), {
    absolutePath: '/var/lib/gallery/image.bin',
    mediaType: 'image/png',
    sourceKind: 'unknown',
  });
});

test('rejects non-image attachments', () => {
  assert.throws(() => normalizeCyberbossImageAttachment({
    absolutePath: '/tmp/document.pdf', contentType: 'application/pdf', kind: 'file',
  }), /cyberboss_attachment_not_image/);
});

test('rejects a missing absolutePath', () => {
  assert.throws(() => normalizeCyberbossImageAttachment({ isImage: true, mimeType: 'image/jpeg' }), /cyberboss_attachment_absolute_path_required/);
});

test('rejects a relative path even when its extension looks like an image', () => {
  assert.throws(() => normalizeCyberbossImageAttachment({
    absolutePath: 'images/photo.jpg', isImage: true, mimeType: 'image/jpeg',
  }), /cyberboss_attachment_absolute_path_required/);
});

test('does not infer an image MIME type from the file extension', () => {
  assert.throws(() => normalizeCyberbossImageAttachment({
    absolutePath: '/tmp/photo.jpg', isImage: true,
  }), /cyberboss_image_media_type_required/);
});
