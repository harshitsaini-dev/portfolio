/**
 * `/terminal-lines` — the scripted lines of the hero's fake terminal. Mirrors
 * `lib/actions/terminal-lines.ts`: the shared schemas pass straight to the
 * repository, exactly as the actions do.
 */

import {
  terminalLineCreateSchema,
  terminalLineUpdateSchema,
} from "@portfolio/schemas";
import { TERMINAL_LINE_TONES } from "@portfolio/types";

import { defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const { str, nstr, int, bool } = primitives;
const TAG = "Terminal lines";

export const terminalLineSchemas: Record<string, JsonSchema> = {
  TerminalLine: entity("A line in the hero's terminal script.", {
    ...META,
    text: str,
    tone: {
      type: "string",
      enum: [...TERMINAL_LINE_TONES],
      description: "`system` prints like program output; `speech` like the owner talking.",
    },
    status: { ...nstr, description: "Short badge shown after the line, e.g. `ok`." },
    position: { ...int, description: "Sort order, ascending." },
    isVisible: bool,
  }),
};

export const terminalLineRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/terminal-lines",
    tag: TAG,
    operationId: "listTerminalLines",
    summary: "List terminal lines",
    description: "In display order. Hidden lines are included unless `visible=true`.",
    scope: "read",
    queryParams: [{ name: "visible", description: "`true` to return visible lines only.", enum: ["true", "false"] }],
    returns: "Terminal lines.",
    response: listOf(ref("TerminalLine")),
    async handler({ repos, query }) {
      return repos.terminalLines.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/terminal-lines/{id}",
    tag: TAG,
    operationId: "getTerminalLine",
    summary: "Get a terminal line",
    scope: "read",
    returns: "The terminal line.",
    response: ref("TerminalLine"),
    async handler({ repos }, { id }) {
      const line = await repos.terminalLines.getById(id!);
      if (!line) throw notFound("Terminal line");
      return line;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/terminal-lines",
    tag: TAG,
    operationId: "createTerminalLine",
    summary: "Create a terminal line",
    description:
      "`text` max 80 characters; `status` max 12 (`\"\"` or null for none). Defaults: tone `system`, position 0, visible.",
    scope: "write",
    body: terminalLineCreateSchema,
    returns: "The created terminal line.",
    response: ref("TerminalLine"),
    async handler({ repos }, _params, input) {
      return repos.terminalLines.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/terminal-lines/{id}",
    tag: TAG,
    operationId: "updateTerminalLine",
    summary: "Update a terminal line",
    description: "Send only the fields to change.",
    scope: "write",
    body: terminalLineUpdateSchema,
    returns: "The updated terminal line.",
    response: ref("TerminalLine"),
    async handler({ repos }, { id }, input) {
      return repos.terminalLines.update(id!, input);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/terminal-lines/{id}",
    tag: TAG,
    operationId: "deleteTerminalLine",
    summary: "Delete a terminal line",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.terminalLines.delete(id!))) throw notFound("Terminal line");
      return null;
    },
  }),
];
