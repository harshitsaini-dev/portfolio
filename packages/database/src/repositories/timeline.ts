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
import { toDatabaseError } from "../errors.ts";
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
import { boolToInt, placeholders, type FieldSpecs } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "timeline_entry";
const HIGHLIGHT_ENTITY = "timeline_highlight";

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
    insertColumns: [
      "role",
      "organization",
      "summary",
      "location",
      "period_label",
      "started_on",
      "ended_on",
      "position",
      "is_visible",
    ],
    insertValues: (input: TimelineEntryCreate) => [
      input.role,
      input.organization,
      input.summary ?? null,
      input.location ?? null,
      input.periodLabel ?? null,
      input.startedOn ?? null,
      input.endedOn ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
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
    },
  });

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
      const now = runtime.now();
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

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set highlights", cause);
      }
    },
  };

  return repository;
}
