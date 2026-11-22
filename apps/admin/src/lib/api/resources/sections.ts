/**
 * `/sections` — mirrors `lib/actions/sections.ts`.
 *
 * A section is one block of the public page (projects, skills, timeline...),
 * addressed by its `key`. The key is fixed at creation; the update schema
 * rejects it, as the admin form does.
 *
 * Alternates are the rotating phrasings of a section's title and eyebrow.
 * The admin saves them in the same form submit; here they have their own
 * `PUT /sections/{id}/alternates`, and every section response carries them.
 *
 * One deliberate difference from the action: the admin silently skips
 * alternates that fail validation. Here they are validated like any other
 * body, and an invalid list is a 422 — a silent drop would look like success.
 */

import { ConflictError, type Repositories } from "@portfolio/database";
import {
  sectionAlternatesSchema,
  sectionCreateSchema,
  sectionUpdateSchema,
} from "@portfolio/schemas";
import type { Section, SectionAlternates } from "@portfolio/types";

import { conflict, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { META, entity, primitives } from "./schemas.ts";

const TAG = "Sections";
const { str, nstr, int, bool } = primitives;

const KEY_TAKEN = "That key is already used by another section.";
const SAVE_CONFLICT = "This section could not be saved. Please review the values and try again.";

const alternatesSchema: JsonSchema = {
  type: "object",
  description: "Rotating alternative phrasings, shown after the canonical text. Up to 8 each.",
  additionalProperties: false,
  required: ["title", "eyebrow"],
  properties: {
    title: { type: "array", items: str },
    eyebrow: { type: "array", items: str },
  },
};

export const sectionSchemas: Record<string, JsonSchema> = {
  SectionAlternates: alternatesSchema,
  SectionWithAlternates: entity("A block of the public page, with its rotating alternates.", {
    ...META,
    iconMediaId: nstr,
    key: { ...str, description: "Machine identifier, e.g. \"projects\". Fixed after creation." },
    title: str,
    subtitle: nstr,
    eyebrow: nstr,
    position: int,
    isVisible: bool,
    accent: { ...nstr, description: "Hex colour, or null to follow the site accent." },
    alternates: { $ref: "#/components/schemas/SectionAlternates" },
  }),
};

const EMPTY: SectionAlternates = { title: [], eyebrow: [] };

function withAlternates(section: Section, alternates: SectionAlternates | undefined) {
  const source = alternates ?? EMPTY;
  return {
    ...section,
    alternates: { title: [...source.title], eyebrow: [...source.eyebrow] },
  };
}

async function sectionById(repos: Repositories, id: string) {
  const section = await repos.sections.getById(id);
  if (!section) throw notFound("Section");
  return withAlternates(section, await repos.sections.getAlternates(id));
}

async function withConflict<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) throw conflict(message);
    throw error;
  }
}

export const sectionRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/sections",
    tag: TAG,
    operationId: "listSections",
    summary: "List page sections",
    description: "Every section in display order, each with its title/eyebrow alternates.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only sections shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Sections with alternates.",
    response: listOf(ref("SectionWithAlternates")),
    async handler({ repos, query }) {
      const [sections, alternates] = await Promise.all([
        repos.sections.list({ visibleOnly: query.get("visible") === "true" }),
        repos.sections.listAlternates(),
      ]);
      return sections.map((section) => withAlternates(section, alternates.get(section.id)));
    },
  }),

  defineRoute({
    method: "GET",
    path: "/sections/{id}",
    tag: TAG,
    operationId: "getSection",
    summary: "Get a section",
    scope: "read",
    returns: "The section with alternates.",
    response: ref("SectionWithAlternates"),
    async handler({ repos }, { id }) {
      return sectionById(repos, id!);
    },
  }),

  defineRoute({
    method: "GET",
    path: "/sections/by-key/{key}",
    tag: TAG,
    operationId: "getSectionByKey",
    summary: "Get a section by its key",
    description: "e.g. `/sections/by-key/projects`.",
    scope: "read",
    returns: "The section with alternates.",
    response: ref("SectionWithAlternates"),
    async handler({ repos }, { key }) {
      const section = await repos.sections.getByKey(key!);
      if (!section) throw notFound("Section");
      return withAlternates(section, await repos.sections.getAlternates(section.id));
    },
  }),

  defineRoute({
    method: "POST",
    path: "/sections",
    tag: TAG,
    operationId: "createSection",
    summary: "Create a section",
    description:
      "`key` must be unique and is fixed afterwards. A key the public site has no component for is stored but renders nothing. Set alternates afterwards with `PUT /sections/{id}/alternates`.",
    scope: "write",
    body: sectionCreateSchema,
    returns: "The created section (with empty alternates).",
    response: ref("SectionWithAlternates"),
    async handler({ repos }, _params, input) {
      const created = await withConflict(KEY_TAKEN, () => repos.sections.create(input));
      return sectionById(repos, created.id);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/sections/{id}",
    tag: TAG,
    operationId: "updateSection",
    summary: "Update a section",
    description: "Send only the fields to change. `key` is not updatable.",
    scope: "write",
    body: sectionUpdateSchema,
    returns: "The updated section with alternates.",
    response: ref("SectionWithAlternates"),
    async handler({ repos }, { id }, input) {
      const updated = await withConflict(SAVE_CONFLICT, () => repos.sections.update(id!, input));
      return sectionById(repos, updated.id);
    },
  }),

  defineRoute({
    method: "PUT",
    path: "/sections/{id}/alternates",
    tag: TAG,
    operationId: "replaceSectionAlternates",
    summary: "Replace a section's title/eyebrow alternates",
    description:
      "Replaces both lists wholesale, in the order given. An omitted list is treated as `[]` and clears it — send both to keep both.",
    scope: "write",
    body: sectionAlternatesSchema,
    returns: "The section with its new alternates.",
    response: ref("SectionWithAlternates"),
    async handler({ repos }, { id }, input) {
      if (!(await repos.sections.getById(id!))) throw notFound("Section");
      await repos.sections.setAlternates(id!, "title", input.title);
      await repos.sections.setAlternates(id!, "eyebrow", input.eyebrow);
      return sectionById(repos, id!);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/sections/{id}",
    tag: TAG,
    operationId: "deleteSection",
    summary: "Delete a section",
    description:
      "Removes the block from the public page, along with its alternates. To hide it instead, PATCH `isVisible: false`.",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.sections.delete(id!))) throw notFound("Section");
      return null;
    },
  }),
];
