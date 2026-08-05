/**
 * Media asset and résumé repositories.
 *
 * D1 holds metadata only — the bytes live in R2 (Phase 9). Nothing in this
 * module reads, writes, or signs object storage; `storageKey` is an opaque
 * reference this layer stores and returns.
 */

import type {
  MediaAsset,
  MediaAssetCreate,
  MediaAssetUpdate,
  Resume,
  ResumeCreate,
  ResumeUpdate,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { NotFoundError, toDatabaseError } from "../errors.ts";
import {
  nullableNumber,
  nullableString,
  requireBoolean,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import { boolToInt, buildPatch, type FieldSpecs } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const MEDIA_ENTITY = "media_asset";
const RESUME_ENTITY = "resume";

const MEDIA_COLUMNS = `id, storage_key, content_type, byte_size, width, height,
  checksum, alt_text, created_at, updated_at`;

function toMediaAsset(row: Row): MediaAsset {
  return {
    id: requireString(MEDIA_ENTITY, row, "id"),
    storageKey: requireString(MEDIA_ENTITY, row, "storage_key"),
    contentType: requireString(MEDIA_ENTITY, row, "content_type"),
    byteSize: requireNumber(MEDIA_ENTITY, row, "byte_size"),
    width: nullableNumber(MEDIA_ENTITY, row, "width"),
    height: nullableNumber(MEDIA_ENTITY, row, "height"),
    checksum: nullableString(MEDIA_ENTITY, row, "checksum"),
    altText: nullableString(MEDIA_ENTITY, row, "alt_text"),
    createdAt: requireString(MEDIA_ENTITY, row, "created_at"),
    updatedAt: requireString(MEDIA_ENTITY, row, "updated_at"),
  };
}

const MEDIA_PATCH: FieldSpecs<MediaAssetUpdate> = {
  contentType: { column: "content_type", encode: (p) => p.contentType },
  width: { column: "width", encode: (p) => p.width ?? null },
  height: { column: "height", encode: (p) => p.height ?? null },
  checksum: { column: "checksum", encode: (p) => p.checksum ?? null },
  altText: { column: "alt_text", encode: (p) => p.altText ?? null },
};

export interface MediaAssetRepository {
  getById(id: string): Promise<MediaAsset | null>;
  getByStorageKey(storageKey: string): Promise<MediaAsset | null>;
  list(): Promise<MediaAsset[]>;
  create(input: MediaAssetCreate): Promise<MediaAsset>;
  /** `storageKey` is immutable — a new object is a new asset row. */
  update(id: string, patch: MediaAssetUpdate): Promise<MediaAsset>;
  /**
   * Rejected with a `ConflictError` while the asset is still attached to a
   * project or résumé (ON DELETE RESTRICT). Detach first.
   */
  delete(id: string): Promise<boolean>;
}

export function createMediaAssetRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): MediaAssetRepository {
  const repository: MediaAssetRepository = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${MEDIA_COLUMNS} FROM media_assets WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toMediaAsset(row) : null;
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "read", cause);
      }
    },

    async getByStorageKey(storageKey) {
      try {
        const row = await db
          .prepare(`SELECT ${MEDIA_COLUMNS} FROM media_assets WHERE storage_key = ?`)
          .bind(storageKey)
          .first<Row>();
        return row ? toMediaAsset(row) : null;
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "read", cause);
      }
    },

    async list() {
      try {
        const result = await db
          .prepare(`SELECT ${MEDIA_COLUMNS} FROM media_assets ORDER BY created_at DESC`)
          .all<Row>();
        return result.results.map(toMediaAsset);
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "list", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO media_assets
               (id, storage_key, content_type, byte_size, width, height,
                checksum, alt_text, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.storageKey,
            input.contentType,
            input.byteSize,
            input.width ?? null,
            input.height ?? null,
            input.checksum ?? null,
            input.altText ?? null,
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "create", cause);
      }
      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          MEDIA_ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async update(id, patch) {
      const clause = buildPatch(patch, MEDIA_PATCH);
      if (clause.isEmpty) {
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(MEDIA_ENTITY);
        return current;
      }
      try {
        const result = await db
          .prepare(
            `UPDATE media_assets SET ${clause.assignments}, updated_at = ? WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) {
          throw new NotFoundError(MEDIA_ENTITY);
        }
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "update", cause);
      }
      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(MEDIA_ENTITY);
      return updated;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM media_assets WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(MEDIA_ENTITY, "delete", cause);
      }
    },
  };

  return repository;
}

// ---------------------------------------------------------------------------
// Résumés
// ---------------------------------------------------------------------------

const RESUME_COLUMNS =
  "id, label, media_asset_id, is_current, is_visible, created_at, updated_at";

function toResume(row: Row): Resume {
  return {
    id: requireString(RESUME_ENTITY, row, "id"),
    label: requireString(RESUME_ENTITY, row, "label"),
    mediaAssetId: requireString(RESUME_ENTITY, row, "media_asset_id"),
    isCurrent: requireBoolean(RESUME_ENTITY, row, "is_current"),
    isVisible: requireBoolean(RESUME_ENTITY, row, "is_visible"),
    createdAt: requireString(RESUME_ENTITY, row, "created_at"),
    updatedAt: requireString(RESUME_ENTITY, row, "updated_at"),
  };
}

const RESUME_PATCH: FieldSpecs<ResumeUpdate> = {
  label: { column: "label", encode: (p) => p.label },
  mediaAssetId: { column: "media_asset_id", encode: (p) => p.mediaAssetId },
  isCurrent: {
    column: "is_current",
    encode: (p) => boolToInt(p.isCurrent ?? false),
  },
  isVisible: {
    column: "is_visible",
    encode: (p) => boolToInt(p.isVisible ?? true),
  },
};

export interface ResumeRepository {
  getById(id: string): Promise<Resume | null>;
  /** `null` when no résumé is marked current — a valid state. */
  getCurrent(): Promise<Resume | null>;
  list(): Promise<Resume[]>;
  create(input: ResumeCreate): Promise<Resume>;
  update(id: string, patch: ResumeUpdate): Promise<Resume>;
  /**
   * Marks one résumé current and clears the flag on all others, in a single
   * batch. Setting `is_current` directly through `update` can trip the
   * partial unique index; this is the safe path.
   */
  makeCurrent(id: string): Promise<Resume>;
  delete(id: string): Promise<boolean>;
}

export function createResumeRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ResumeRepository {
  const repository: ResumeRepository = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${RESUME_COLUMNS} FROM resumes WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toResume(row) : null;
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "read", cause);
      }
    },

    async getCurrent() {
      try {
        const row = await db
          .prepare(`SELECT ${RESUME_COLUMNS} FROM resumes WHERE is_current = 1`)
          .first<Row>();
        return row ? toResume(row) : null;
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "read", cause);
      }
    },

    async list() {
      try {
        const result = await db
          .prepare(`SELECT ${RESUME_COLUMNS} FROM resumes ORDER BY created_at DESC`)
          .all<Row>();
        return result.results.map(toResume);
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "list", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO resumes
               (id, label, media_asset_id, is_current, is_visible, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.label,
            input.mediaAssetId,
            boolToInt(input.isCurrent ?? false),
            boolToInt(input.isVisible ?? true),
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "create", cause);
      }
      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          RESUME_ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async update(id, patch) {
      const clause = buildPatch(patch, RESUME_PATCH);
      if (clause.isEmpty) {
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(RESUME_ENTITY);
        return current;
      }
      try {
        const result = await db
          .prepare(
            `UPDATE resumes SET ${clause.assignments}, updated_at = ? WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) {
          throw new NotFoundError(RESUME_ENTITY);
        }
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "update", cause);
      }
      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(RESUME_ENTITY);
      return updated;
    },

    async makeCurrent(id) {
      const now = runtime.now();
      try {
        // Clear first, then set: doing it the other way round would leave
        // two rows with is_current = 1 momentarily and trip the partial
        // unique index.
        await db.batch([
          db
            .prepare(
              `UPDATE resumes SET is_current = 0, updated_at = ? WHERE is_current = 1`,
            )
            .bind(now),
          db
            .prepare(
              `UPDATE resumes SET is_current = 1, updated_at = ? WHERE id = ?`,
            )
            .bind(now, id),
        ]);
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "make current", cause);
      }
      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(RESUME_ENTITY);
      return updated;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM resumes WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(RESUME_ENTITY, "delete", cause);
      }
    },
  };

  return repository;
}
