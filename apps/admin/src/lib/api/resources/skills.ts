/**
 * `/skill-categories` and `/skills` — mirrors `lib/actions/skills.ts`.
 *
 * Two levels, as in the admin: a category groups skills, and a skill belongs
 * to exactly one category (`categoryId`, fixed at creation — the update
 * schema rejects it, as the admin form does). A category that still contains
 * skills cannot be deleted; delete or move its skills first.
 */

import { ConflictError, type Repositories } from "@portfolio/database";
import {
  skillCategoryCreateSchema,
  skillCategoryUpdateSchema,
  skillCreateSchema,
  skillUpdateSchema,
} from "@portfolio/schemas";

import { conflict, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { META, entity, primitives } from "./schemas.ts";

const TAG = "Skills";

const { str, nstr, nint, int, bool } = primitives;

const CATEGORY_SLUG_TAKEN = "That slug is already used by another skill category.";
const CATEGORY_IN_USE =
  "This category still contains skills. Delete those skills before deleting this category.";
const SKILL_CONFLICT =
  "That skill could not be saved. A skill with this name may already exist in the chosen category, or the category may no longer exist.";

const categoryFields = {
  ...META,
  iconMediaId: nstr,
  name: str,
  slug: str,
  description: nstr,
  position: int,
  isVisible: bool,
} as const;

export const skillSchemas: Record<string, JsonSchema> = {
  Skill: entity("A single skill inside a skill category.", {
    ...META,
    iconMediaId: nstr,
    categoryId: str,
    name: str,
    proficiency: { ...nint, description: "1–5, or null for no rating." },
    position: int,
    isVisible: bool,
  }),
  SkillCategory: entity("A group of skills, e.g. \"Frontend\".", categoryFields),
  SkillCategoryWithSkills: entity("A skill category with its skills, in display order.", {
    ...categoryFields,
    skills: { type: "array", items: { $ref: "#/components/schemas/Skill" } },
  }),
};

const VISIBLE_QUERY = {
  name: "visible",
  description: "`true` to return only rows shown on the public site.",
  enum: ["true", "false"],
} as const;

/** Rethrow a ConflictError with the admin's own wording. */
async function withConflict<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) throw conflict(message);
    throw error;
  }
}

async function categoryWithSkills(repos: Repositories, id: string) {
  const category = await repos.skills.getById(id);
  if (!category) throw notFound("Skill category");
  const skills = await repos.skills.listSkills(id);
  return { ...category, skills };
}

export const skillRoutes: ApiRoute[] = [
  // ---- Categories --------------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/skill-categories",
    tag: TAG,
    operationId: "listSkillCategories",
    summary: "List skill categories with their skills",
    description: "Every category in display order, each with its skills in display order.",
    scope: "read",
    queryParams: [VISIBLE_QUERY],
    returns: "Skill categories with skills.",
    response: listOf(ref("SkillCategoryWithSkills")),
    async handler({ repos, query }) {
      return repos.skills.listWithSkills({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/skill-categories/{id}",
    tag: TAG,
    operationId: "getSkillCategory",
    summary: "Get a skill category with its skills",
    scope: "read",
    returns: "The category with its skills.",
    response: ref("SkillCategoryWithSkills"),
    async handler({ repos }, { id }) {
      return categoryWithSkills(repos, id!);
    },
  }),

  defineRoute({
    method: "GET",
    path: "/skill-categories/{id}/skills",
    tag: TAG,
    operationId: "listSkillsInCategory",
    summary: "List the skills in one category",
    scope: "read",
    returns: "Skills in display order.",
    response: listOf(ref("Skill")),
    async handler({ repos }, { id }) {
      if (!(await repos.skills.getById(id!))) throw notFound("Skill category");
      return repos.skills.listSkills(id!);
    },
  }),

  defineRoute({
    method: "POST",
    path: "/skill-categories",
    tag: TAG,
    operationId: "createSkillCategory",
    summary: "Create a skill category",
    description: "`slug` must be unique among categories. Add skills to it with `POST /skills`.",
    scope: "write",
    body: skillCategoryCreateSchema,
    returns: "The created category (with an empty `skills` list).",
    response: ref("SkillCategoryWithSkills"),
    async handler({ repos }, _params, input) {
      const created = await withConflict(CATEGORY_SLUG_TAKEN, () => repos.skills.create(input));
      return categoryWithSkills(repos, created.id);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/skill-categories/{id}",
    tag: TAG,
    operationId: "updateSkillCategory",
    summary: "Update a skill category",
    description: "Send only the fields to change.",
    scope: "write",
    body: skillCategoryUpdateSchema,
    returns: "The updated category with its skills.",
    response: ref("SkillCategoryWithSkills"),
    async handler({ repos }, { id }, input) {
      const updated = await withConflict(CATEGORY_SLUG_TAKEN, () => repos.skills.update(id!, input));
      return categoryWithSkills(repos, updated.id);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/skill-categories/{id}",
    tag: TAG,
    operationId: "deleteSkillCategory",
    summary: "Delete a skill category",
    description: "Refused with 409 while the category still contains skills — delete them first.",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      const deleted = await withConflict(CATEGORY_IN_USE, () => repos.skills.delete(id!));
      if (!deleted) throw notFound("Skill category");
      return null;
    },
  }),

  // ---- Skills ------------------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/skills/{id}",
    tag: TAG,
    operationId: "getSkill",
    summary: "Get a skill",
    scope: "read",
    returns: "The skill.",
    response: ref("Skill"),
    async handler({ repos }, { id }) {
      const skill = await repos.skills.getSkillById(id!);
      if (!skill) throw notFound("Skill");
      return skill;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/skills",
    tag: TAG,
    operationId: "createSkill",
    summary: "Create a skill in a category",
    description:
      "`categoryId` must name an existing category (`GET /skill-categories`) and cannot be changed later. Names are unique within a category.",
    scope: "write",
    body: skillCreateSchema,
    returns: "The created skill.",
    response: ref("Skill"),
    async handler({ repos }, _params, input) {
      return withConflict(SKILL_CONFLICT, () => repos.skills.createSkill(input));
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/skills/{id}",
    tag: TAG,
    operationId: "updateSkill",
    summary: "Update a skill",
    description: "Send only the fields to change. `categoryId` is not updatable — delete and re-create to move a skill.",
    scope: "write",
    body: skillUpdateSchema,
    returns: "The updated skill.",
    response: ref("Skill"),
    async handler({ repos }, { id }, input) {
      return withConflict(SKILL_CONFLICT, () => repos.skills.updateSkill(id!, input));
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/skills/{id}",
    tag: TAG,
    operationId: "deleteSkill",
    summary: "Delete a skill",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.skills.deleteSkill(id!))) throw notFound("Skill");
      return null;
    },
  }),
];
