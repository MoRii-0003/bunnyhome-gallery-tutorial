import crypto from 'node:crypto';
import { open, link, copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { galleryError, GALLERY_ERRORS } from './gallery-errors.js';
import { galleryImagePath, galleryPaths } from './gallery-paths.js';

const CLAIM_STALE_MS = 2 * 60 * 1000;
const CLAIM_WAIT_MS = 30_000;
const CLAIM_POLL_MS = 25;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class LocalGalleryStore {
  constructor({ rootDir, claimStaleMs = CLAIM_STALE_MS, claimWaitMs = CLAIM_WAIT_MS, fileLink = link, fileCopy = copyFile }) {
    this.rootDir = path.resolve(rootDir);
    this.claimStaleMs = claimStaleMs;
    this.claimWaitMs = claimWaitMs;
    this.fileLink = fileLink;
    this.fileCopy = fileCopy;
  }

  paths(id, mediaType) {
    return galleryPaths(this.rootDir, id, mediaType);
  }

  async ensureDirectories() {
    const paths = this.paths('0'.repeat(64));
    await Promise.all([paths.images, paths.meta, paths.claims].map((directory) => mkdir(directory, { recursive: true })));
  }

  async get(id) {
    const { metadata } = this.paths(id);
    try {
      return JSON.parse(await readFile(metadata, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async list() {
    const { meta } = this.paths('0'.repeat(64));
    let names;
    try { names = await readdir(meta); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
    const items = await Promise.all(names
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .map(async (name) => {
        try {
          const item = JSON.parse(await readFile(path.join(meta, name), 'utf8'));
          return item?.id === name.slice(0, 64) ? item : null;
        } catch { return null; }
      }));
    return items.filter(Boolean).sort((a, b) =>
      Date.parse(b.created_at || b.last_seen_at || 0) - Date.parse(a.created_at || a.last_seen_at || 0));
  }

  async acquireClaim(id) {
    const { claim } = this.paths(id);
    await this.ensureDirectories();
    const deadline = Date.now() + this.claimWaitMs;
    while (Date.now() < deadline) {
      const token = crypto.randomUUID();
      let handle;
      try {
        handle = await open(claim, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ token, created_at: new Date().toISOString() }));
        return token;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      } finally {
        await handle?.close();
      }

      const current = await readFile(claim, 'utf8').then((value) => {
        try { return JSON.parse(value); } catch { return null; }
      }).catch(() => null);
      const createdAt = Date.parse(current?.created_at || '');
      let modifiedAt = 0;
      try { modifiedAt = (await stat(claim)).mtimeMs; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      const claimAt = Number.isFinite(createdAt) ? createdAt : modifiedAt;
      if (claimAt && Date.now() - claimAt > this.claimStaleMs) {
        if (await this.removeStaleClaim(claim)) continue;
      }
      await pause(CLAIM_POLL_MS);
    }
    throw galleryError(GALLERY_ERRORS.claimTimeout);
  }

  async removeStaleClaim(claim) {
    const reaper = `${claim}.reap`;
    let handle;
    try {
      handle = await open(reaper, 'wx', 0o600);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let reaperAge = 0;
      try { reaperAge = Date.now() - (await stat(reaper)).mtimeMs; } catch (statError) { if (statError?.code !== 'ENOENT') throw statError; }
      if (reaperAge > this.claimStaleMs) {
        await unlink(reaper).catch((unlinkError) => { if (unlinkError?.code !== 'ENOENT') throw unlinkError; });
      }
      return false;
    }

    try {
      const current = await readFile(claim, 'utf8').then((value) => {
        try { return JSON.parse(value); } catch { return null; }
      }).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
      const createdAt = Date.parse(current?.created_at || '');
      let modifiedAt = 0;
      try { modifiedAt = (await stat(claim)).mtimeMs; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      const claimAt = Number.isFinite(createdAt) ? createdAt : modifiedAt;
      if (!claimAt || Date.now() - claimAt <= this.claimStaleMs) return false;
      await unlink(claim).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
      return true;
    } finally {
      await handle.close();
      await unlink(reaper).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
  }

  async releaseClaim(id, token) {
    const { claim } = this.paths(id);
    const current = await readFile(claim, 'utf8').then((value) => {
      try { return JSON.parse(value); } catch { return null; }
    }).catch((error) => { if (error?.code === 'ENOENT') return null; throw error; });
    if (current?.token === token) await unlink(claim).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
  }

  async persistImage(sourcePath, id, mediaType, sourceBytes) {
    const destination = galleryImagePath(this.rootDir, id, mediaType);
    await mkdir(path.dirname(destination), { recursive: true });
    const checkExisting = async () => {
      try {
        const existing = await readFile(destination);
        if (crypto.createHash('sha256').update(existing).digest('hex') !== id) {
          throw galleryError(GALLERY_ERRORS.imageStorageConflict);
        }
        return { path: destination, mode: 'existing' };
      } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
    };

    try {
      await this.fileLink(sourcePath, destination);
      const linked = await checkExisting();
      if (linked) return { path: destination, mode: 'linked' };
    } catch (error) {
      if (error?.code === GALLERY_ERRORS.imageStorageConflict) {
        await unlink(destination).catch((unlinkError) => { if (unlinkError?.code !== 'ENOENT') throw unlinkError; });
      } else {
        let existing;
        try { existing = await checkExisting(); } catch (checkError) {
          if (checkError?.code !== GALLERY_ERRORS.imageStorageConflict) throw checkError;
          await unlink(destination).catch((unlinkError) => { if (unlinkError?.code !== 'ENOENT') throw unlinkError; });
        }
        if (existing) return existing;
      }
    }

    await unlink(destination).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    try {
      await this.fileCopy(sourcePath, destination, constants.COPYFILE_EXCL);
      const copied = await checkExisting();
      if (copied) return { path: destination, mode: 'copied' };
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const existing = await checkExisting();
        if (existing) return existing;
      }
      if (error?.code === GALLERY_ERRORS.imageStorageConflict) {
        await unlink(destination).catch((unlinkError) => { if (unlinkError?.code !== 'ENOENT') throw unlinkError; });
      }
      if (!sourceBytes) throw error;
    }

    await writeFile(destination, sourceBytes, { flag: 'wx', mode: 0o600 });
    const snapshot = await checkExisting();
    if (!snapshot) throw galleryError(GALLERY_ERRORS.imageStorageConflict);
    return { path: destination, mode: 'copied' };
  }

  async removeImage(id, mediaType) {
    await unlink(galleryImagePath(this.rootDir, id, mediaType)).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }

  async delete(id) {
    const token = await this.acquireClaim(id);
    try {
      const item = await this.get(id);
      if (!item) return { deleted: false, imageCleanupFailed: false };

      const { metadata } = this.paths(id);
      await unlink(metadata);
      try {
        await this.removeImage(id, item.media_type);
        return { deleted: true, imageCleanupFailed: false };
      } catch {
        return { deleted: true, imageCleanupFailed: true };
      }
    } finally {
      await this.releaseClaim(id, token);
    }
  }

  async readImage(id, mediaType) {
    return readFile(galleryImagePath(this.rootDir, id, mediaType));
  }

  async writeMetadata(id, metadata) {
    const { metadata: destination, meta } = this.paths(id);
    await mkdir(meta, { recursive: true });
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
    return metadata;
  }

  async updateMetadata(id, update) {
    const token = await this.acquireClaim(id);
    try {
      const current = await this.get(id);
      if (!current) throw galleryError(GALLERY_ERRORS.itemNotFound);
      return await this.writeMetadata(id, { ...update(current), updated_at: new Date().toISOString() });
    } finally {
      await this.releaseClaim(id, token);
    }
  }
}
