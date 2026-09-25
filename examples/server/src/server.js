import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createGalleryCore } from './gallery/index.js';
import { loadGalleryConfig } from './gallery/gallery-config.js';
import { GALLERY_ERRORS } from './gallery/gallery-errors.js';
import { GallerySettingsStore } from './gallery/gallery-settings-store.js';

const ID_PATTERN = /^[a-f0-9]{64}$/;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(serverDir, '..', '..', 'web', 'dist');

function publicItem(item) {
  return {
    id: item.id,
    title: item.title || '',
    first_description: item.first_description || '',
    first_impression: item.first_impression || '',
    first_context_note: item.first_context_note || '',
    media_type: item.media_type,
    first_seen_at: item.first_seen_at,
    last_seen_at: item.last_seen_at,
    seen_count: Number(item.seen_count || 0),
    image_url: `/api/gallery/${item.id}/image`,
  };
}

export function createApp({ core, settingsStore, staticDir = webDist } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/gallery', async (_req, res) => {
    try {
      const items = await core.store.list();
      res.json(items.map(publicItem));
    } catch {
      res.status(500).json({ error: 'gallery_unavailable' });
    }
  });

  app.get('/api/gallery/:id/image', async (req, res) => {
    const { id } = req.params;
    if (!ID_PATTERN.test(id)) return res.status(400).json({ error: GALLERY_ERRORS.invalidId });
    try {
      const item = await core.store.get(id);
      if (!item || item.id !== id || !IMAGE_TYPES.has(item.media_type)) {
        return res.status(404).json({ error: GALLERY_ERRORS.itemNotFound });
      }
      const bytes = await core.store.readImage(id, item.media_type);
      res.set('Content-Type', item.media_type);
      res.set('Cache-Control', 'private');
      return res.send(bytes);
    } catch (error) {
      return res.status(error?.code === 'ENOENT' ? 404 : 500)
        .json({ error: error?.code === 'ENOENT' ? GALLERY_ERRORS.itemNotFound : 'gallery_image_unavailable' });
    }
  });

  app.patch('/api/gallery/:id', async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: GALLERY_ERRORS.invalidId });
    if (!req.body || typeof req.body.title !== 'string' || Object.keys(req.body).some((key) => key !== 'title')) {
      return res.status(400).json({ error: GALLERY_ERRORS.titleRequired });
    }
    try {
      res.json(publicItem(await core.memory.renameTitle(req.params.id, req.body.title)));
    } catch (error) {
      const status = error?.code === GALLERY_ERRORS.itemNotFound ? 404 : 400;
      res.status(status).json({ error: error?.code || GALLERY_ERRORS.titleRequired });
    }
  });

  app.delete('/api/gallery/:id', async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: GALLERY_ERRORS.invalidId });
    try {
      const result = await core.memory.deleteItem(req.params.id);
      if (!result.deleted) return res.status(404).json({ error: GALLERY_ERRORS.itemNotFound });
      if (result.imageCleanupFailed) console.warn('[gallery:delete] image cleanup incomplete');
      return res.json({ deleted: true, imageCleanupFailed: result.imageCleanupFailed });
    } catch {
      return res.status(500).json({ error: 'gallery_delete_failed' });
    }
  });

  app.get('/api/settings/vision', async (_req, res) => {
    try { res.json(await settingsStore.getVisionSettings()); }
    catch { res.status(500).json({ error: 'gallery_settings_unavailable' }); }
  });

  app.patch('/api/settings/vision', async (req, res) => {
    const body = req.body;
    const allowed = new Set(['baseUrl', 'model', 'timeoutMs', 'apiKey']);
    if (!body || Object.keys(body).some((key) => !allowed.has(key))
      || typeof body.baseUrl !== 'string' || typeof body.model !== 'string'
      || typeof body.timeoutMs !== 'number'
      || (body.apiKey !== undefined && typeof body.apiKey !== 'string')) {
      return res.status(400).json({ error: 'invalid_vision_settings' });
    }
    try { res.json(await settingsStore.saveVisionSettings(body)); }
    catch { res.status(500).json({ error: 'gallery_settings_write_failed' }); }
  });

  if (staticDir && fs.existsSync(staticDir)) app.use(express.static(staticDir));
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

export function loadWebServerConfig(env = process.env) {
  const host = String(env.CYBERBOSS_GALLERY_WEB_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const parsedPort = Number(env.CYBERBOSS_GALLERY_WEB_PORT || 8787);
  return { host, port: Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 8787 };
}

if (process.env.NODE_ENV !== 'test') {
  const config = loadGalleryConfig(process.env, path.resolve(serverDir, '..', '..', '..'));
  const settingsStore = new GallerySettingsStore({ rootDir: config.rootDir, defaults: config.vision });
  const core = createGalleryCore(config, { getVisionConfig: () => settingsStore.getVisionConfig() });
  const { host, port } = loadWebServerConfig();
  createApp({ core, settingsStore }).listen(port, host, () => {
    console.log(`Cyberboss Gallery listening on http://${host}:${port}`);
  });
}
