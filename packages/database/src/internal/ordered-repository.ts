/**
 * Shared plumbing for "ordered, toggleable list" content tables.
 *
 * Six domains (social links, education, certifications, tools, sections,
 * skill categories) have identical *mechanics*: insert with generated
 * id/timestamps, patch through an allowlist, read one, list ordered and
 * optionally filtered by visibility, delete.
 *
 * This helper factors out that plumbing only. It is not a generic table
 * abstraction: every domain still declares its own table name, column list,
 * row decoder, insert bindings, and patch allowlist, and still exposes its
 * own named domain interface. Nothing here lets a caller name a table or a
 * column at runtime.
 */

import type { D1Like } from "../d1.ts";
import { NotFoundError, toDatabaseError } from "../errors.ts";
import type { Row } from "../mapping.ts";
import type { RepositoryRuntime } from "../runtime.ts";
import { buildPatch, type FieldSpecs } from "./sql.ts";

export interface OrderedListOptions {
  /** When true, only rows with `is_visible = 1`. Public reads pass true. */
  readonly visibleOnly?: boolean;
}

export interface OrderedRepositoryConfig<TEntity, TCreate, TUpdate extends object> {
  readonly entity: string;
  /** Literal table name, written in source — never caller-supplied. */
  readonly table: string;
  /** Literal column list for SELECTs. */
  readonly columns: string;
  readonly decode: (row: Row) => TEntity;
  /** Column names for INSERT, excluding id/created_at/updated_at. */
  readonly insertColumns: readonly string[];
  /** Values matching `insertColumns`, in order. */
  readonly insertValues: (input: TCreate) => readonly unknown[];
  readonly patch: FieldSpecs<TUpdate>;
  /** Secondary ordering column applied after `position`. */
  readonly tieBreaker?: string;
}

export interface OrderedRepository<TEntity, TCreate, TUpdate> {
  getById(id: string): Promise<TEntity | null>;
  list(options?: OrderedListOptions): Promise<TEntity[]>;
  create(input: TCreate): Promise<TEntity>;
  update(id: string, patch: TUpdate): Promise<TEntity>;
  delete(id: string): Promise<boolean>;
}

export function createOrderedRepository<
  TEntity,
  TCreate,
  TUpdate extends object,
>(
  db: D1Like,
  runtime: RepositoryRuntime,
  config: OrderedRepositoryConfig<TEntity, TCreate, TUpdate>,
): OrderedRepository<TEntity, TCreate, TUpdate> {
  const { entity, table, columns, decode } = config;
  const tieBreaker = config.tieBreaker ?? "created_at";

  const repository: OrderedRepository<TEntity, TCreate, TUpdate> = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${columns} FROM ${table} WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? decode(row) : null;
      } catch (cause) {
        throw toDatabaseError(entity, "read", cause);
      }
    },

    async list(options) {
      // `visibleOnly` selects between two literal WHERE clauses; it never
      // becomes SQL text itself. Both orderings match the
      // `(is_visible, position)` index from Phase 4.
      const where = options?.visibleOnly ? "WHERE is_visible = 1" : "";
      try {
        const result = await db
          .prepare(
            `SELECT ${columns} FROM ${table} ${where}
             ORDER BY position ASC, ${tieBreaker} ASC`,
          )
          .all<Row>();
        return result.results.map(decode);
      } catch (cause) {
        throw toDatabaseError(entity, "list", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      const cols = ["id", ...config.insertColumns, "created_at", "updated_at"];
      const values = [id, ...config.insertValues(input), now, now];
      const marks = new Array(cols.length).fill("?").join(", ");

      try {
        await db
          .prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${marks})`)
          .bind(...values)
          .run();
      } catch (cause) {
        throw toDatabaseError(entity, "create", cause);
      }

      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          entity,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async update(id, patch) {
      const clause = buildPatch(patch, config.patch);
      if (clause.isEmpty) {
        // No-op patches must not bump updated_at.
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(entity);
        return current;
      }

      try {
        const result = await db
          .prepare(
            `UPDATE ${table} SET ${clause.assignments}, updated_at = ? WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) throw new NotFoundError(entity);
      } catch (cause) {
        throw toDatabaseError(entity, "update", cause);
      }

      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(entity);
      return updated;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM ${table} WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(entity, "delete", cause);
      }
    },
  };

  return repository;
}
