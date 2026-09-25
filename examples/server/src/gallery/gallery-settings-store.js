import crypto from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export class GallerySettingsStore {
  constructor({ rootDir, defaults = {} }) {
    this.filePath = path.join(path.resolve(rootDir), 'settings.json');
    this.defaults = {
      baseUrl: String(defaults.baseUrl || '').trim(),
      apiKey: String(defaults.apiKey || '').trim(),
      model: String(defaults.model || '').trim(),
      timeoutMs: Number(defaults.timeoutMs) > 0 ? Number(defaults.timeoutMs) : 30_000,
    };
  }

  async readPersisted() {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8'));
      return value?.vision && typeof value.vision === 'object' ? value.vision : {};
    } catch (error) {
      if (error?.code === 'ENOENT') return {};
      throw new Error('gallery_settings_unavailable');
    }
  }

  async getVisionConfig() {
    const saved = await this.readPersisted();
    const timeoutMs = Number(saved.timeoutMs);
    return {
      ...this.defaults,
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : this.defaults.baseUrl,
      apiKey: typeof saved.apiKey === 'string' && saved.apiKey ? saved.apiKey : this.defaults.apiKey,
      model: typeof saved.model === 'string' ? saved.model : this.defaults.model,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : this.defaults.timeoutMs,
    };
  }

  async getVisionSettings() {
    const { baseUrl, model, timeoutMs, apiKey } = await this.getVisionConfig();
    return { baseUrl, model, timeoutMs, apiKeyConfigured: Boolean(apiKey) };
  }

  async saveVisionSettings(input = {}) {
    const previous = await this.readPersisted();
    const existing = await this.getVisionConfig();
    const baseUrl = String(input.baseUrl || '').trim();
    const model = String(input.model || '').trim();
    const timeoutMs = Number(input.timeoutMs);
    const apiKey = String(input.apiKey || '').trim();
    const vision = {
      baseUrl,
      model,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    };
    if (apiKey) vision.apiKey = apiKey;
    else if (typeof previous.apiKey === 'string' && previous.apiKey) vision.apiKey = previous.apiKey;
    else if (existing.apiKey && this.defaults.apiKey !== existing.apiKey) vision.apiKey = existing.apiKey;

    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ vision }, null, 2), 'utf8');
      await handle.chmod(0o600);
      await handle.close();
      handle = null;
      await rename(temporary, this.filePath);
      await chmod(this.filePath, 0o600);
    } catch {
      throw new Error('gallery_settings_write_failed');
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
    return this.getVisionSettings();
  }
}
