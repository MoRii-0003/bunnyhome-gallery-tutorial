import path from 'node:path';

export function loadGalleryConfig(env = process.env, cwd = process.cwd()) {
  const timeout = Number(env.CYBERBOSS_GALLERY_VISION_TIMEOUT_MS || 30_000);
  return {
    rootDir: path.resolve(cwd, env.CYBERBOSS_GALLERY_ROOT || '.cyberboss-state/gallery'),
    vision: {
      baseUrl: String(env.CYBERBOSS_GALLERY_VISION_BASE_URL || '').trim(),
      apiKey: String(env.CYBERBOSS_GALLERY_VISION_API_KEY || '').trim(),
      model: String(env.CYBERBOSS_GALLERY_VISION_MODEL || '').trim(),
      timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
    },
  };
}
