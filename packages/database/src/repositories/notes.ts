/**
 * Notes: the written posts.
 *
 * Not built on `createOrderedRepository` like the small ordered lists, because
 * a note is addressed three different ways — by id in the admin, by slug on the
 * public site, and by status in both — and the shared helper knows only about
 * id and position. Bending it to fit would hide the slug uniqueness and the
 * status filter, which are the two rules that actually matter here.
 *
 * ## Tags are a JSON array in one column
 *
 * Decoded defensively: a row whose `tags` is malformed, or is JSON but not an
 * array of strings, yields an empty list rather than throwing. Tags are
 * decoration — a note with no chips still reads perfectly — and a page that
 * refuses to render because a label is malformed trades something valuable for
 * something that is not.
 */

import type {
  Note,
  NoteCreate,
  NoteUpdate,
  ProjectStatus,
} from "@portfolio/types";
import { PROJECT_STATUSES } from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { ConflictError, NotFoundError, toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireEnum,
  requireNumber,
  requireString,
} from "../mapping.ts";
import { placeholders } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "note";

const COLUMNS = `id, slug, title, summary, body, status, published_at,
  cover_media_id, tags, position, accent, created_at, updated_at`;

/**
 * The ordering the public list and the admin both use.
 *
 * `position` first so a pinned note can jump the queue, then the date the post
 * claims, then the row's own creation time so the order is total — two notes
 * published on the same day would otherwise come back in whatever order SQLite
 * felt like, which makes a list that reshuffles between requests.
 */
const ORDER_BY = `ORDER BY position ASC,
  COALESCE(published_at, created_at) DESC,
  created_at DESC`;

function decodeTags(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    return [];
  }
}

function toNote(row: Record<string, unknown>): Note {
  return {
    id: requireString(ENTITY, row, "id"),
    slug: requireString(ENTITY, row, "slug"),
    title: requireString(ENTITY, row, "title"),
    summary: requireString(ENTITY, row, "summary"),
    body: requireString(ENTITY, row, "body"),
    status: requireEnum<ProjectStatus>(ENTITY, row, "status", PROJECT_STATUSES),
    publishedAt: nullableString(ENTITY, row, "published_at"),
    coverMediaId: nullableString(ENTITY, row, "cover_media_id"),
    tags: decodeTags(requireString(ENTITY, row, "tags")),
    position: requireNumber(ENTITY, row, "position"),
    accent: nullableString(ENTITY, row, "accent"),
    createdAt: requireString(ENTITY, row, "created_at"),
    updatedAt: requireString(ENTITY, row, "updated_at"),
  };
}

export interface NoteListOptions {
  readonly statuses?: readonly ProjectStatus[];
}

export interface NoteRepository {
  getById(id: string): Promise<Note | null>;
  /** By URL. Returns the row whatever its status — the caller decides. */
  getBySlug(slug: string): Promise<Note | null>;
  list(options?: NoteListOptions): Promise<Note[]>;
  create(input: NoteCreate): Promise<Note>;
  update(id: string, patch: NoteUpdate): Promise<Note>;
  delete(id: string): Promise<boolean>;
}

export function createNoteRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): NoteRepository {
  /**
   * Turns the UNIQUE(slug) failure into a `ConflictError`.
   *
   * The constraint is the real check — two admins saving at once cannot both
   * win a "does this slug exist" query — so the error it raises is translated
   * rather than pre-empted.
   */
  function rethrow(operation: "create" | "upsert", cause: unknown): never {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("UNIQUE") && message.includes("slug")) {
      throw new ConflictError(ENTITY, "that URL is already in use", { cause });
    }
    throw toDatabaseError(ENTITY, operation, cause);
  }

  const repository: NoteRepository = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM notes WHERE id = ?`)
          .bind(id)
          .first<Record<string, unknown>>();
        return row ? toNote(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async getBySlug(slug) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM notes WHERE slug = ?`)
          .bind(slug)
          .first<Record<string, unknown>>();
        return row ? toNote(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async list(options) {
      const statuses = options?.statuses;
      const where =
        statuses && statuses.length > 0
          ? `WHERE status IN (${placeholders(statuses.length)})`
          : "";
      try {
        const result = await db
          .prepare(`SELECT ${COLUMNS} FROM notes ${where} ${ORDER_BY}`)
          .bind(...(statuses ?? []))
          .all<Record<string, unknown>>();
        return (result.results ?? []).map(toNote);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO notes
               (id, slug, title, summary, body, status, published_at,
                cover_media_id, tags, position, accent, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.slug,
            input.title,
            input.summary,
            input.body,
            input.status,
            input.publishedAt,
            input.coverMediaId,
            JSON.stringify(input.tags),
            input.position,
            input.accent ?? null,
            now,
            now,
          )
          .run();
      } catch (cause) {
        rethrow("create", cause);
      }

      const saved = await repository.getById(id);
      if (!saved) throw toDatabaseError(ENTITY, "create", new Error("vanished"));
      return saved;
    },

    async update(id, patch) {
      // Built from the patch rather than writing every column: an update that
      // rewrote untouched fields would clobber a concurrent edit, and would
      // turn "no change" into a new `updated_at`.
      const sets: string[] = [];
      const values: unknown[] = [];
      const put = (column: string, value: unknown) => {
        sets.push(`${column} = ?`);
        values.push(value);
      };

      if (patch.slug !== undefined) put("slug", patch.slug);
      if (patch.title !== undefined) put("title", patch.title);
      if (patch.summary !== undefined) put("summary", patch.summary);
      if (patch.body !== undefined) put("body", patch.body);
      if (patch.status !== undefined) put("status", patch.status);
      if (patch.publishedAt !== undefined) put("published_at", patch.publishedAt);
      if (patch.coverMediaId !== undefined)
        put("cover_media_id", patch.coverMediaId);
      if (patch.tags !== undefined) put("tags", JSON.stringify(patch.tags));
      if (patch.position !== undefined) put("position", patch.position);
      if (patch.accent !== undefined) put("accent", patch.accent);

      if (sets.length === 0) {
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(ENTITY, id);
        return current;
      }

      put("updated_at", runtime.now());

      try {
        const result = await db
          .prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`)
          .bind(...values, id)
          .run();
        if (result.meta?.changes === 0) throw new NotFoundError(ENTITY, id);
      } catch (cause) {
        if (cause instanceof NotFoundError) throw cause;
        rethrow("upsert", cause);
      }

      const saved = await repository.getById(id);
      if (!saved) throw new NotFoundError(ENTITY, id);
      return saved;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM notes WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "delete", cause);
      }
    },
  };

  return repository;
}
