/**
 * `/notes` — short written posts. Mirrors `lib/actions/notes.ts`: the shared
 * schemas pass straight to the repository, exactly as the actions do.
 *
 * One input quirk is kept rather than papered over: `tags` is sent as a
 * single comma-separated string (the admin's text box), and comes back as an
 * array. Changing that would mean a second schema that could drift from the
 * one the admin validates with.
 */

import { noteCreateSchema, noteUpdateSchema } from "@portfolio/schemas";
import { PROJECT_STATUSES, type ProjectStatus } from "@portfolio/types";

import { badRequest, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const { str, nstr, int } = primitives;
const TAG = "Notes";

function parseStatuses(raw: string | null): ProjectStatus[] | undefined {
  if (raw === null || raw === "") return undefined;
  const values = raw.split(",");
  for (const value of values) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(value)) {
      throw badRequest(`Unknown status "${value}". Use: ${PROJECT_STATUSES.join(", ")}.`);
    }
  }
  return values as ProjectStatus[];
}

export const noteSchemas: Record<string, JsonSchema> = {
  Note: entity("A written note (short post) with a page of its own.", {
    ...META,
    slug: str,
    title: str,
    summary: str,
    body: { ...str, description: "Markdown." },
    status: { type: "string", enum: [...PROJECT_STATUSES] },
    publishedAt: { ...nstr, description: "Publication date, YYYY-MM-DD." },
    coverMediaId: nstr,
    tags: { type: "array", items: str },
    position: int,
    accent: { ...nstr, description: "#rrggbb, or null to follow the site accent." },
  }),
};

export const noteRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/notes",
    tag: TAG,
    operationId: "listNotes",
    summary: "List notes",
    description: "All notes, every status unless filtered.",
    scope: "read",
    queryParams: [{ name: "status", description: "Comma-separated filter, e.g. `published` or `draft,archived`." }],
    returns: "Notes.",
    response: listOf(ref("Note")),
    async handler({ repos, query }) {
      return repos.notes.list({ statuses: parseStatuses(query.get("status")) });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/notes/{id}",
    tag: TAG,
    operationId: "getNote",
    summary: "Get a note",
    scope: "read",
    returns: "The note.",
    response: ref("Note"),
    async handler({ repos }, { id }) {
      const note = await repos.notes.getById(id!);
      if (!note) throw notFound("Note");
      return note;
    },
  }),

  defineRoute({
    method: "GET",
    path: "/notes/by-slug/{slug}",
    tag: TAG,
    operationId: "getNoteBySlug",
    summary: "Get a note by its slug",
    scope: "read",
    returns: "The note.",
    response: ref("Note"),
    async handler({ repos }, { slug }) {
      const note = await repos.notes.getBySlug(slug!);
      if (!note) throw notFound("Note");
      return note;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/notes",
    tag: TAG,
    operationId: "createNote",
    summary: "Create a note",
    description:
      "`slug` is lowercase words joined by single hyphens and must be unique (409 otherwise). `body` is Markdown. **`tags` is one comma-separated string** (e.g. `\"react, performance\"`, at most 8 kept) and is returned as an array. `publishedAt` is `YYYY-MM-DD` or null. Defaults to `status: \"draft\"`; set `\"published\"` to show it on the site.",
    scope: "write",
    body: noteCreateSchema,
    returns: "The created note.",
    response: ref("Note"),
    async handler({ repos }, _params, input) {
      return repos.notes.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/notes/{id}",
    tag: TAG,
    operationId: "updateNote",
    summary: "Update a note",
    description:
      "Send only the fields to change. `tags`, when sent, is a comma-separated string that replaces the whole list (`\"\"` clears it).",
    scope: "write",
    body: noteUpdateSchema,
    returns: "The updated note.",
    response: ref("Note"),
    async handler({ repos }, { id }, input) {
      return repos.notes.update(id!, input);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/notes/{id}",
    tag: TAG,
    operationId: "deleteNote",
    summary: "Delete a note",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.notes.delete(id!))) throw notFound("Note");
      return null;
    },
  }),
];
