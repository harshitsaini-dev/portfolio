/**
 * `/tools` — mirrors `lib/actions/tools.ts`: the "tools I use" list.
 *
 * Plain ordered rows. Names are unique; a clash is a 409 with the admin's own
 * wording.
 */

import { ConflictError } from "@portfolio/database";
import { toolCreateSchema, toolUpdateSchema } from "@portfolio/schemas";

import { conflict, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { META, entity, primitives } from "./schemas.ts";

const TAG = "Tools";
const { str, nstr, int, bool } = primitives;

const NAME_TAKEN = "That name is already used by another tool.";

export const toolSchemas: Record<string, JsonSchema> = {
  Tool: entity("A tool in the \"tools I use\" list.", {
    ...META,
    iconMediaId: nstr,
    name: str,
    purpose: nstr,
    url: nstr,
    position: int,
    isVisible: bool,
  }),
};

async function withConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) throw conflict(NAME_TAKEN);
    throw error;
  }
}

export const toolRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/tools",
    tag: TAG,
    operationId: "listTools",
    summary: "List tools",
    description: "Every tool, in display order.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only rows shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Tools.",
    response: listOf(ref("Tool")),
    async handler({ repos, query }) {
      return repos.tools.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/tools/{id}",
    tag: TAG,
    operationId: "getTool",
    summary: "Get a tool",
    scope: "read",
    returns: "The tool.",
    response: ref("Tool"),
    async handler({ repos }, { id }) {
      const tool = await repos.tools.getById(id!);
      if (!tool) throw notFound("Tool");
      return tool;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/tools",
    tag: TAG,
    operationId: "createTool",
    summary: "Create a tool",
    description: "`name` must be unique. `url`, if given, must be http(s).",
    scope: "write",
    body: toolCreateSchema,
    returns: "The created tool.",
    response: ref("Tool"),
    async handler({ repos }, _params, input) {
      return withConflict(() => repos.tools.create(input));
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/tools/{id}",
    tag: TAG,
    operationId: "updateTool",
    summary: "Update a tool",
    description: "Send only the fields to change; `null` clears `purpose` or `url`.",
    scope: "write",
    body: toolUpdateSchema,
    returns: "The updated tool.",
    response: ref("Tool"),
    async handler({ repos }, { id }, input) {
      return withConflict(() => repos.tools.update(id!, input));
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/tools/{id}",
    tag: TAG,
    operationId: "deleteTool",
    summary: "Delete a tool",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.tools.delete(id!))) throw notFound("Tool");
      return null;
    },
  }),
];
