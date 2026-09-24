/**
 * AI provider contract used by Gallery Core.
 *
 * @typedef {Object} GalleryProvider
 * @property {(input: { message?: string, image?: object|null, memory?: object|null, requestMetadata?: boolean }) => Promise<{ reply: string, metadata: { title: string, first_impression: string }|null }>} replyAsCompanion
 * @property {(image: object) => Promise<string>} describeImageNeutral
 */

export function isGalleryProvider(provider) {
  return typeof provider?.replyAsCompanion === 'function'
    && typeof provider?.describeImageNeutral === 'function';
}
