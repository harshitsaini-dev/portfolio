import type {
  Technology,
  TechnologyCreate,
  TechnologyUpdate,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { NotFoundError, toDatabaseError } from "../errors.ts";
import { nullableString, requireString, type Row } from "../mapping.ts";
import { buildPatch, type FieldSpecs } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "technology";

/** Exported so the project repository can decode joined technology rows. */
export function toTechnology(row: Row): Technology {
  return {
    id: requireString(ENTITY, row, "id"),
    name: requireString(ENTITY, row, "name"),
    slug: requireString(ENTITY, row, "slug"),
    category: nullableString(ENTITY, row, "category"),
    createdAt: requireString(ENTITY, row, "created_at"),
    updatedAt: requireString(ENTITY, row, "updated_at"),
  };
}

const PATCH: FieldSpecs<TechnologyUpdate> = {
  name: { column: "name", encode: (p) => p.name },
  slug: { column: "slug", encode: (p) => p.slug },
  category: { column: "category", encode: (p) => p.category ?? null },
};

export interface TechnologyRepository {
  getById(id: string): Promise<Technology | null>;
  getBySlug(slug: string): Promise<Technology | null>;
  list(): Promise<Technology[]>;
  create(input: TechnologyCreate): Promise<Technology>;
  update(id: string, patch: TechnologyUpdate): Promise<Technology>;
  /**
   * Deleting a technology still attached to a project is rejected by the
   * schema's ON DELETE RESTRICT and surfaces as a `ConflictError`. Detach it
   * from projects first.
   */
  delete(id: string): Promise<boolean>;
}

const COLUMNS = "id, name, slug, category, created_at, updated_at";

export function createTechnologyRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): TechnologyRepository {
  const repository: TechnologyRepository = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM technologies WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toTechnology(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async getBySlug(slug) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM technologies WHERE slug = ?`)
          .bind(slug)
          .first<Row>();
        return row ? toTechnology(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async list() {
      try {
        const result = await db
          .prepare(`SELECT ${COLUMNS} FROM technologies ORDER BY name ASC`)
          .all<Row>();
        return result.results.map(toTechnology);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO technologies (id, name, slug, category, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, input.name, input.slug, input.category ?? null, now, now)
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "create", cause);
      }
      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async update(id, patch) {
      const clause = buildPatch(patch, PATCH);
      if (clause.isEmpty) {
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(ENTITY);
        return current;
      }
      try {
        const result = await db
          .prepare(
            `UPDATE technologies SET ${clause.assignments}, updated_at = ? WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) throw new NotFoundError(ENTITY);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "update", cause);
      }
      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(ENTITY);
      return updated;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM technologies WHERE id = ?`)
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
