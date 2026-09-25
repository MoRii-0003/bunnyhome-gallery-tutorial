import crypto from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { normalizeCyberbossImageAttachment } from '../adapters/cyberboss/image-attachment.js';
import { GALLERY_ERRORS } from './gallery-errors.js';

const CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000;
const CANDIDATE_ID_PATTERN = /^[a-f0-9-]{36}$/;
const ATTACHMENT_FIELDS = ['absolutePath', 'contentType', 'mimeType', 'kind', 'sourceKind', 'isImage'];
const cleanContext = (value) => Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, 600).join('');

export class GalleryCandidates {
  constructor({ rootDir, legacyStateDir, legacyFs = {}, warn = console.warn }) {
    this.directory = path.join(path.resolve(rootDir), 'candidates');
    this.legacyDirectory = legacyStateDir ? path.join(path.resolve(legacyStateDir), 'gallery-candidates') : null;
    this.legacyFs = { readdir, readFile, copyFile, unlink, rmdir, ...legacyFs };
    this.warn = warn;
  }

  async create(attachment, contextNote) {
    if (String(attachment?.sourceKind || '').trim().toLowerCase() === 'sticker') {
      return { created: false, skipped: true, reason: GALLERY_ERRORS.nativeSticker };
    }
    let normalized;
    try {
      normalized = normalizeCyberbossImageAttachment(attachment);
    } catch (error) {
      const errors = {
        cyberboss_attachment_not_image: GALLERY_ERRORS.attachmentNotImage,
        cyberboss_attachment_absolute_path_required: GALLERY_ERRORS.attachmentPathRequired,
        cyberboss_image_media_type_required: GALLERY_ERRORS.attachmentMimeRequired,
      };
      return { created: false, skipped: true, reason: errors[error?.message] || GALLERY_ERRORS.attachmentNotImage };
    }
    await this.prepare();
    const candidateId = crypto.randomUUID();
    const destination = this.candidatePath(candidateId);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    const candidate = {
      attachment: Object.fromEntries(ATTACHMENT_FIELDS
        .filter((field) => attachment?.[field] !== undefined)
        .map((field) => [field, attachment[field]])),
      contextNote: cleanContext(contextNote),
      createdAt: Date.now(),
    };
    candidate.attachment.absolutePath = normalized.absolutePath;
    candidate.attachment.sourceKind = normalized.sourceKind;
    candidate.attachment.isImage = true;
    try {
      await writeFile(temporary, JSON.stringify(candidate), { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
      return { created: true, candidateId };
    } finally {
      await unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
  }

  async read(candidateId) {
    if (typeof candidateId !== 'string' || !CANDIDATE_ID_PATTERN.test(candidateId)) return null;
    await this.prepare();
    try {
      const candidate = JSON.parse(await readFile(this.candidatePath(candidateId), 'utf8'));
      if (!candidate?.createdAt || Date.now() - candidate.createdAt > CANDIDATE_TTL_MS) {
        await this.remove(candidateId);
        return null;
      }
      return candidate;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(candidateId) {
    if (typeof candidateId !== 'string' || !CANDIDATE_ID_PATTERN.test(candidateId)) return;
    await unlink(this.candidatePath(candidateId)).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    if (this.legacyDirectory) await this.removeLegacyFile(path.join(this.legacyDirectory, `${candidateId}.json`));
  }

  async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.migrateLegacy();
    await this.prune(this.directory);
  }

  async prune(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (error?.code === 'ENOENT') return [];
      throw error;
    });
    const now = Date.now();
    await Promise.all(entries
      .filter((entry) => entry.isFile() && /^[a-f0-9-]{36}\.json$/.test(entry.name))
      .map(async ({ name }) => {
        const file = path.join(directory, name);
        let contents;
        try {
          contents = await readFile(file, 'utf8');
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
          return;
        }
        let candidate;
        try { candidate = JSON.parse(contents); } catch { candidate = null; }
        if (!candidate?.createdAt || now - candidate.createdAt > CANDIDATE_TTL_MS) {
          await unlink(file).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
        }
      }));
  }

  async migrateLegacy() {
    if (!this.legacyDirectory || path.resolve(this.legacyDirectory) === path.resolve(this.directory)) return;
    let entries;
    try {
      entries = await this.legacyFs.readdir(this.legacyDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warnMigration('scan legacy candidates', error);
      return;
    }
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9-]{36}\.json$/.test(entry.name)) continue;
      const source = path.join(this.legacyDirectory, entry.name);
      let candidate;
      try {
        candidate = JSON.parse(await this.legacyFs.readFile(source, 'utf8'));
      } catch (error) {
        if (error?.code !== 'ENOENT') this.warnMigration('read legacy candidate', error);
        await this.removeLegacyFile(source);
        continue;
      }
      if (!candidate?.createdAt || now - candidate.createdAt > CANDIDATE_TTL_MS) {
        await this.removeLegacyFile(source);
        continue;
      }
      const destination = path.join(this.directory, entry.name);
      try {
        await this.legacyFs.copyFile(source, destination, constants.COPYFILE_EXCL);
        await this.removeLegacyFile(source);
      } catch (error) {
        if (error?.code === 'EEXIST') {
          const existing = await this.legacyFs.readFile(destination, 'utf8').then(JSON.parse).catch(() => null);
          if (existing?.createdAt) await this.removeLegacyFile(source);
          continue;
        }
        this.warnMigration('copy legacy candidate', error);
      }
    }
    try {
      await this.legacyFs.rmdir(this.legacyDirectory);
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) {
        this.warnMigration('remove empty legacy candidate directory', error);
      }
    }
  }

  async removeLegacyFile(file) {
    try {
      await this.legacyFs.unlink(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warnMigration('remove legacy candidate', error);
    }
  }

  warnMigration(operation, error) {
    try { this.warn?.(`[gallery] could not ${operation}${error?.code ? ` (${error.code})` : ''}`); } catch { /* Migration must stay best-effort. */ }
  }

  candidatePath(candidateId) {
    return path.join(this.directory, `${candidateId}.json`);
  }
}
