/**
 * `/education` — mirrors `lib/actions/education.ts`.
 *
 * The validated body goes to the repository as-is, exactly as the admin
 * does: the shared schema already is the repository's input shape.
 */

import { educationEntryCreateSchema, educationEntryUpdateSchema } from "@portfolio/schemas";

import { defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const TAG = "Education";

const { str, nstr, int, bool } = primitives;

export const educationSchemas: Record<string, JsonSchema> = {
  EducationEntry: entity("A degree, diploma or course.", {
    ...META,
    iconMediaId: nstr,
    qualification: str,
    institution: str,
    fieldOfStudy: nstr,
    summary: nstr,
    periodLabel: nstr,
    startedOn: { ...nstr, description: "YYYY-MM-DD" },
    endedOn: { ...nstr, description: "YYYY-MM-DD" },
    position: int,
    isVisible: bool,
  }),
};

export const educationRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/education",
    tag: TAG,
    operationId: "listEducationEntries",
    summary: "List education entries",
    description: "Every entry in display order (`position`). Hidden entries are included unless `visible=true`.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only entries shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Education entries.",
    response: listOf(ref("EducationEntry")),
    async handler({ repos, query }) {
      return repos.education.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/education/{id}",
    tag: TAG,
    operationId: "getEducationEntry",
    summary: "Get an education entry",
    scope: "read",
    returns: "The entry.",
    response: ref("EducationEntry"),
    async handler({ repos }, { id }) {
      const entry = await repos.education.getById(id!);
      if (!entry) throw notFound("Education entry");
      return entry;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/education",
    tag: TAG,
    operationId: "createEducationEntry",
    summary: "Create an education entry",
    description:
      "`endedOn` must not precede `startedOn`. `iconMediaId`, if given, must name an existing media asset (`GET /media`). Visible by default.",
    scope: "write",
    body: educationEntryCreateSchema,
    returns: "The created entry.",
    response: ref("EducationEntry"),
    async handler({ repos }, _params, input) {
      return repos.education.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/education/{id}",
    tag: TAG,
    operationId: "updateEducationEntry",
    summary: "Update an education entry",
    description: "Send only the fields to change; `null` clears a nullable field.",
    scope: "write",
    body: educationEntryUpdateSchema,
    returns: "The updated entry.",
    response: ref("EducationEntry"),
    async handler({ repos }, { id }, input) {
      return repos.education.update(id!, input);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/education/{id}",
    tag: TAG,
    operationId: "deleteEducationEntry",
    summary: "Delete an education entry",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.education.delete(id!))) throw notFound("Education entry");
      return null;
    },
  }),
];
