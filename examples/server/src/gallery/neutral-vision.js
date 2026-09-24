import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';
import { galleryImagePath } from './gallery-paths.js';

export const NEUTRAL_VISION_PROMPT = [
  'You are a private neutral image-indexing worker, not the companion and not a participant in the conversation.',
  'Return exactly one Chinese paragraph containing only directly visible facts.',
  'Cover the main subjects, composition, colors, lighting, spatial relationships, and clearly readable text when present.',
  'Do not infer identity, psychology, emotion, intention, relationship, backstory, personality, or meaning.',
  'Do not address anyone. Do not add a label, markdown, JSON, tags, or commentary.',
].join(' ');

function configured(config) {
  return Boolean(config?.baseUrl && config?.model);
}

function responseText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('\n').trim();
  return '';
}

export class NeutralVision {
  constructor({ store, memory, config, fetchImpl = fetch }) {
    this.store = store;
    this.memory = memory;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async describeAndStore(id) {
    const item = await this.store.get(id);
    if (!item) throw galleryError(GALLERY_ERRORS.itemNotFound);
    if (item.first_description) return item.first_description;
    if (!configured(this.config)) return { skipped: true, reason: GALLERY_ERRORS.visionNotConfigured };

    const bytes = await this.store.readImage(id, item.media_type);
    const controller = new AbortController();
    const timeoutMs = Number(this.config.timeoutMs) > 0 ? Number(this.config.timeoutMs) : 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
      const response = await this.fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: NEUTRAL_VISION_PROMPT },
              { type: 'image_url', image_url: { url: `data:${item.media_type};base64,${bytes.toString('base64')}` } },
            ],
          }],
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`gallery_vision_request_failed:${response.status}`);
      const description = responseText(data);
      if (!description) throw new Error('gallery_vision_description_missing');
      const updated = await this.memory.setFirstDescription(id, description);
      return updated.first_description;
    } finally {
      clearTimeout(timer);
    }
  }
}
