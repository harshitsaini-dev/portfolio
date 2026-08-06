/**
 * Timeline repository. Owns `timeline_highlights`, which has no top-level
 * repository: a highlight is meaningless outside the entry it belongs to.
 */

import type {
  TimelineEntry,
  TimelineEntryCreate,
  TimelineEntryUpdate,
  TimelineEntryWithHighlights,
  TimelineHighlight,
} from "@portfolio/types";

import type { D1Like, D1PreparedStatement } from "../d1.ts";
import { NotFoundError, toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireBoolean,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import {
  createOrderedRepository,
  type OrderedListOptions,
  type OrderedRepository,
} from "../internal/ordered-repository.ts";
import {
  boolToInt,
  buildPatch,
  placeholders,
  type FieldSpecs,
} from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "timeline_entry";
const HIGHLIGHT_ENTITY = "timeline_highlight";

/** Columns written on insert, excluding id/created_at/updated_at. */
const INSERT_COLUMNS = [
  "role",
  "organization",
  "summary",
  "location",
  "period_label",
  "started_on",
  "ended_on",
  "position",
  "is_visible",
] as const;

function insertValues(input: TimelineEntryCreate): readonly unknown[] {
  return [
    input.role,
    input.organization,
    input.summary ?? null,
    input.location ?? null,
    input.periodLabel ?? null,
    input.startedOn ?? null,
    input.endedOn ?? null,
    input.position ?? 0,
    boolToInt(input.isVisible ?? true),
  ];
}

/**
 * Updatable fields.
 *
 * Hoisted to module scope so the ordered base and the aggregate write below
 * share one allowlist — two copies would be a place for them to drift.
 */
const PATCH: FieldSpecs<TimelineEntryUpdate> = {
  role: { column: "role", encode: (p) => p.role },
  organization: { column: "organization", encode: (p) => p.organization },
  summary: { column: "summary", encode: (p) => p.summary ?? null },
  location: { column: "location", encode: (p) => p.location ?? null },
  periodLabel: { column: "period_label", encode: (p) => p.periodLabel ?? null },
  startedOn: { column: "started_on", encode: (p) => p.startedOn ?? null },
  endedOn: { column: "ended_on", encode: (p) => p.endedOn ?? null },
  position: { column: "position", encode: (p) => p.position },
  isVisible: {
    column: "is_visible",
    encode: (p) => boolToInt(p.isVisible ?? true),
  },
};

const COLUMNS = `id, role, organization, summary, location, period_label,
  started_on, ended_on, position, is_visible, created_at, updated_at`;

function toEntry(row: Row): TimelineEntry {
  return {
    id: requireString(ENTITY, row, "id"),
    role: requireString(ENTITY, row, "role"),
    organization: requireString(ENTITY, row, "organization"),
    summary: nullableString(ENTITY, row, "summary"),
    location: nullableString(ENTITY, row, "location"),
    periodLabel: nullableString(ENTITY, row, "period_label"),
    startedOn: nullableString(ENTITY, row, "started_on"),
    endedOn: nullableString(ENTITY, row, "ended_on"),
    position: requireNumber(ENTITY, row, "position"),
    isVisible: requireBoolean(ENTITY, row, "is_visible"),
    createdAt: requireString(ENTITY, row, "created_at"),
    updatedAt: requireString(ENTITY, row, "updated_at"),
  };
}

function toHighlight(row: Row): TimelineHighlight {
  return {
    id: requireString(HIGHLIGHT_ENTITY, row, "id"),
    timelineEntryId: requireString(HIGHLIGHT_ENTITY, row, "timeline_entry_id"),
    content: requireString(HIGHLIGHT_ENTITY, row, "content"),
    position: requireNumber(HIGHLIGHT_ENTITY, row, "position"),
  };
}

export interface TimelineRepository
  extends OrderedRepository<
    TimelineEntry,
    TimelineEntryCreate,
    TimelineEntryUpdate
  > {
  /** Entries with their highlights, in one extra query rather than N. */
  listWithHighlights(
    options?: OrderedListOptions,
  ): Promise<TimelineEntryWithHighlights[]>;
  listHighlights(entryId: string): Promise<TimelineHighlight[]>;
  /** Replaces an entry's highlights wholesale, in one batch. */
  setHighlights(entryId: string, contents: readonly string[]): Promise<void>;

  /**
   * Create an entry and its highlights as **one** aggregate write.
   *
   * `create()` followed by `setHighlights()` is two round-trips: if the
   * second fails, the entry is left persisted with no highlights — a
   * half-saved aggregate the caller never asked for. Both statements go into
   * a single `db.batch()` here, so the entry and its highlights commit or
   * roll back together.
   *
   * Highlight order is the array order; `position` is assigned from the
   * index, so callers never supply it.
   */
  createWithHighlights(
    input: TimelineEntryCreate,
    highlights: readonly string[],
  ): Promise<TimelineEntryWithHighlights>;

  /**
   * Update an entry and replace its highlights as **one** aggregate write.
   *
   * Same reasoning as `createWithHighlights`: a successful parent update
   * followed by a failed highlight replacement would leave the entry
   * showing new text with stale — or missing — bullets.
   *
   * Throws `NotFoundError` if the entry does not exist.
   */
  updateWithHighlights(
    id: string,
    patch: TimelineEntryUpdate,
    highlights: readonly string[],
  ): Promise<TimelineEntryWithHighlights>;
}

export function createTimelineRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): TimelineRepository {
  // Explicit type arguments: leaving TUpdate to inference would let it be
  // widened from the patch literal instead of staying the domain type.
  const base = createOrderedRepository<
    TimelineEntry,
    TimelineEntryCreate,
    TimelineEntryUpdate
  >(db, runtime, {
    entity: ENTITY,
    table: "timeline_entries",
    columns: COLUMNS,
    decode: toEntry,
    insertColumns: INSERT_COLUMNS,
    insertValues,
    patch: PATCH,
  });

  /** Statements that write an entry's highlights, positioned by array order. */
  function highlightStatements(
    entryId: string,
    contents: readonly string[],
    now: string,
  ): D1PreparedStatement[] {
    const statements: D1PreparedStatement[] = [
      db
        .prepare(`DELETE FROM timeline_highlights WHERE timeline_entry_id = ?`)
        .bind(entryId),
    ];
    contents.forEach((content, index) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO timeline_highlights
               (id, timeline_entry_id, content, position, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(runtime.newId(), entryId, content, index, now),
      );
    });
    return statements;
  }

  const repository: TimelineRepository = {
    ...base,

    async listWithHighlights(options) {
      const entries = await base.list(options);
      if (entries.length === 0) return [];

      const ids = entries.map((entry) => entry.id);
      try {
        const result = await db
          .prepare(
            `SELECT id, timeline_entry_id, content, position
             FROM timeline_highlights
             WHERE timeline_entry_id IN (${placeholders(ids.length)})
             ORDER BY timeline_entry_id, position ASC`,
          )
          .bind(...ids)
          .all<Row>();

        const byEntry = new Map<string, TimelineHighlight[]>();
        for (const row of result.results) {
          const highlight = toHighlight(row);
          const bucket = byEntry.get(highlight.timelineEntryId);
          if (bucket) bucket.push(highlight);
          else byEntry.set(highlight.timelineEntryId, [highlight]);
        }

        return entries.map((entry) => ({
          ...entry,
          highlights: byEntry.get(entry.id) ?? [],
        }));
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list highlights", cause);
      }
    },

    async listHighlights(entryId) {
      try {
        const result = await db
          .prepare(
            `SELECT id, timeline_entry_id, content, position
             FROM timeline_highlights WHERE timeline_entry_id = ?
             ORDER BY position ASC`,
          )
          .bind(entryId)
          .all<Row>();
        return result.results.map(toHighlight);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list highlights", cause);
      }
    },

    async setHighlights(entryId, contents) {
      try {
        await db.batch(highlightStatements(entryId, contents, runtime.now()));
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set highlights", cause);
      }
    },

    async createWithHighlights(input, highlights) {
      const id = runtime.newId();
      const now = runtime.now();
      const cols = ["id", ...INSERT_COLUMNS, "created_at", "updated_at"];
      const marks = new Array(cols.length).fill("?").join(", ");

      // The id is generated here rather than by the database, which is what
      // makes a single batch possible: the child rows can reference the
      // parent before it has been written.
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO timeline_entries (${cols.join(", ")}) VALUES (${marks})`,
          )
          .bind(id, ...insertValues(input), now, now),
        // The leading DELETE is a no-op for a brand-new id, and keeps this
        // sharing one statement builder with the update path.
        ...highlightStatements(id, highlights, now),
      ];

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "create with highlights", cause);
      }

      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          ENTITY,
          "create with highlights",
          new Error("row missing immediately after insert"),
        );
      }
      return { ...created, highlights: await repository.listHighlights(id) };
    },

    async updateWithHighlights(id, patch, highlights) {
      // Existence is checked before the batch rather than inferred from it:
      // when `highlights` is empty and the patch is empty, every statement
      // legitimately affects zero rows, so "no changes" cannot distinguish a
      // missing entry from a no-op. A row deleted between this check and the
      // batch is still caught — the highlight INSERTs would violate the
      // foreign key and abort the whole batch.
      const existing = await repository.getById(id);
      if (!existing) throw new NotFoundError(ENTITY);

      const now = runtime.now();
      const clause = buildPatch(patch, PATCH);
      const statements: D1PreparedStatement[] = [];

      if (!clause.isEmpty) {
        statements.push(
          db
            .prepare(
              `UPDATE timeline_entries SET ${clause.assignments}, updated_at = ?
               WHERE id = ?`,
            )
            .bind(...clause.values, now, id),
        );
      }
      statements.push(...highlightStatements(id, highlights, now));

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "update with highlights", cause);
      }

      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(ENTITY);
      return { ...updated, highlights: await repository.listHighlights(id) };
    },
  };

  return repository;
}
