/**
 * Skills repository. Owns skill categories and the skills within them.
 *
 * Categories and skills share one repository because they are one editing
 * surface: the CMS shows categories with their skills nested, and a skill
 * cannot exist without a category (the schema enforces this with
 * ON DELETE RESTRICT).
 */

import type {
  Skill,
  SkillCategory,
  SkillCategoryCreate,
  SkillCategoryUpdate,
  SkillCategoryWithSkills,
  SkillCreate,
  SkillUpdate,
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

const CATEGORY_ENTITY = "skill_category";
const SKILL_ENTITY = "skill";

const CATEGORY_COLUMNS =
  "id, name, slug, description, position, is_visible, created_at, updated_at";
const SKILL_COLUMNS =
  "id, category_id, name, proficiency, position, is_visible, created_at, updated_at";

function toCategory(row: Row): SkillCategory {
  return {
    id: requireString(CATEGORY_ENTITY, row, "id"),
    name: requireString(CATEGORY_ENTITY, row, "name"),
    slug: requireString(CATEGORY_ENTITY, row, "slug"),
    description: nullableString(CATEGORY_ENTITY, row, "description"),
    position: requireNumber(CATEGORY_ENTITY, row, "position"),
    isVisible: requireBoolean(CATEGORY_ENTITY, row, "is_visible"),
    createdAt: requireString(CATEGORY_ENTITY, row, "created_at"),
    updatedAt: requireString(CATEGORY_ENTITY, row, "updated_at"),
  };
}

function toSkill(row: Row): Skill {
  return {
    id: requireString(SKILL_ENTITY, row, "id"),
    categoryId: requireString(SKILL_ENTITY, row, "category_id"),
    name: requireString(SKILL_ENTITY, row, "name"),
    proficiency: nullableNumber(SKILL_ENTITY, row, "proficiency"),
    position: requireNumber(SKILL_ENTITY, row, "position"),
    isVisible: requireBoolean(SKILL_ENTITY, row, "is_visible"),
    createdAt: requireString(SKILL_ENTITY, row, "created_at"),
    updatedAt: requireString(SKILL_ENTITY, row, "updated_at"),
  };
}

const SKILL_PATCH: FieldSpecs<SkillUpdate> = {
  // `categoryId` is absent: moving a skill between categories is a distinct
  // operation, not a field edit, and would need re-ordering handled too.
  name: { column: "name", encode: (p) => p.name },
  proficiency: { column: "proficiency", encode: (p) => p.proficiency ?? null },
  position: { column: "position", encode: (p) => p.position },
  isVisible: {
    column: "is_visible",
    encode: (p) => boolToInt(p.isVisible ?? true),
  },
};

export interface SkillsRepository
  extends OrderedRepository<
    SkillCategory,
    SkillCategoryCreate,
    SkillCategoryUpdate
  > {
  /** Categories with their skills nested, in one extra query rather than N. */
  listWithSkills(
    options?: OrderedListOptions,
  ): Promise<SkillCategoryWithSkills[]>;
  listSkills(categoryId: string): Promise<Skill[]>;
  /**
   * One skill by id, or `null`.
   *
   * Added for the admin edit route, which addresses a skill directly and has
   * no category in hand. The alternative — `listWithSkills()` then a linear
   * scan — reads every category and every skill to return one row.
   *
   * Returns `null` rather than throwing, matching `getById` on the ordered
   * base so callers branch the same way for both entities.
   */
  getSkillById(id: string): Promise<Skill | null>;
  createSkill(input: SkillCreate): Promise<Skill>;
  updateSkill(id: string, patch: SkillUpdate): Promise<Skill>;
  deleteSkill(id: string): Promise<boolean>;
}

export function createSkillsRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): SkillsRepository {
  // Explicit type arguments: leaving TUpdate to inference would let it be
  // widened from the patch literal instead of staying the domain type.
  const base = createOrderedRepository<
    SkillCategory,
    SkillCategoryCreate,
    SkillCategoryUpdate
  >(db, runtime, {
    entity: CATEGORY_ENTITY,
    table: "skill_categories",
    columns: CATEGORY_COLUMNS,
    decode: toCategory,
    insertColumns: ["name", "slug", "description", "position", "is_visible"],
    insertValues: (input: SkillCategoryCreate) => [
      input.name,
      input.slug,
      input.description ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      name: { column: "name", encode: (p) => p.name },
      slug: { column: "slug", encode: (p) => p.slug },
      description: { column: "description", encode: (p) => p.description ?? null },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });

  async function getSkillById(id: string): Promise<Skill | null> {
    try {
      const row = await db
        .prepare(`SELECT ${SKILL_COLUMNS} FROM skills WHERE id = ?`)
        .bind(id)
        .first<Row>();
      return row ? toSkill(row) : null;
    } catch (cause) {
      throw toDatabaseError(SKILL_ENTITY, "read", cause);
    }
  }

  return {
    ...base,

    getSkillById,

    async listWithSkills(options) {
      const categories = await base.list(options);
      if (categories.length === 0) return [];

      const ids = categories.map((category) => category.id);
      // Skill visibility is filtered alongside the category's own, so a
      // public read never surfaces a hidden skill inside a visible category.
      const skillFilter = options?.visibleOnly ? "AND is_visible = 1" : "";

      try {
        const result = await db
          .prepare(
            `SELECT ${SKILL_COLUMNS} FROM skills
             WHERE category_id IN (${placeholders(ids.length)}) ${skillFilter}
             ORDER BY category_id, position ASC`,
          )
          .bind(...ids)
          .all<Row>();

        const byCategory = new Map<string, Skill[]>();
        for (const row of result.results) {
          const skill = toSkill(row);
          const bucket = byCategory.get(skill.categoryId);
          if (bucket) bucket.push(skill);
          else byCategory.set(skill.categoryId, [skill]);
        }

        return categories.map((category) => ({
          ...category,
          skills: byCategory.get(category.id) ?? [],
        }));
      } catch (cause) {
        throw toDatabaseError(CATEGORY_ENTITY, "list skills", cause);
      }
    },

    async listSkills(categoryId) {
      try {
        const result = await db
          .prepare(
            `SELECT ${SKILL_COLUMNS} FROM skills WHERE category_id = ?
             ORDER BY position ASC`,
          )
          .bind(categoryId)
          .all<Row>();
        return result.results.map(toSkill);
      } catch (cause) {
        throw toDatabaseError(SKILL_ENTITY, "list", cause);
      }
    },

    async createSkill(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO skills
               (id, category_id, name, proficiency, position, is_visible,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.categoryId,
            input.name,
            input.proficiency ?? null,
            input.position ?? 0,
            boolToInt(input.isVisible ?? true),
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(SKILL_ENTITY, "create", cause);
      }
      const created = await getSkillById(id);
      if (!created) {
        throw toDatabaseError(
          SKILL_ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async updateSkill(id, patch) {
      const clause = buildPatch(patch, SKILL_PATCH);
      if (clause.isEmpty) {
        const current = await getSkillById(id);
        if (!current) throw new NotFoundError(SKILL_ENTITY);
        return current;
      }
      try {
        const result = await db
          .prepare(
            `UPDATE skills SET ${clause.assignments}, updated_at = ? WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) {
          throw new NotFoundError(SKILL_ENTITY);
        }
      } catch (cause) {
        throw toDatabaseError(SKILL_ENTITY, "update", cause);
      }
      const updated = await getSkillById(id);
      if (!updated) throw new NotFoundError(SKILL_ENTITY);
      return updated;
    },

    async deleteSkill(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM skills WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(SKILL_ENTITY, "delete", cause);
      }
    },
  };
}
