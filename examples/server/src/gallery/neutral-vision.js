import { GALLERY_ERRORS } from './gallery-errors.js';

export const NEUTRAL_VISION_PROMPT = [
  'You are a private neutral image-indexing worker, not the companion and not a participant in the conversation.',
  'Write a concise Chinese description using only directly visible facts, with a hard limit of 200 Chinese characters; use as many sentences as needed.',
  'Prioritize the main subjects and the most useful details about composition, colors, lighting, spatial relationships, and clearly readable text; omit unnecessary detail.',
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
  constructor({ config, getConfig, fetchImpl = fetch }) {
    this.getConfig = getConfig || (async () => config || {});
    this.fetchImpl = fetchImpl;
  }

  async describeImage({ bytes, mediaType }) {
    const config = await this.getConfig();
    if (!configured(config)) return { skipped: true, reason: GALLERY_ERRORS.visionNotConfigured };

    const controller = new AbortController();
    const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const baseUrl = config.baseUrl.replace(/\/+$/, '');
      const response = await this.fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: NEUTRAL_VISION_PROMPT },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${bytes.toString('base64')}` } },
            ],
          }],
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`gallery_vision_request_failed:${response.status}`);
      const description = responseText(data);
      if (!description) throw new Error('gallery_vision_description_missing');
      return description;
    } finally {
      clearTimeout(timer);
    }
  }
}
