/**
 * `/robot-lines` — the speech-bubble lines the 3D robot says. Mirrors
 * `lib/actions/robot-lines.ts`: the shared schemas pass straight to the
 * repository, exactly as the actions do.
 */

import {
  robotLineCreateSchema,
  robotLineUpdateSchema,
} from "@portfolio/schemas";

import { defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const { str, int, bool } = primitives;
const TAG = "Robot lines";

export const robotLineSchemas: Record<string, JsonSchema> = {
  RobotLine: entity("A line the 3D robot says in its speech bubble.", {
    ...META,
    text: str,
    position: { ...int, description: "Sort order, ascending." },
    isVisible: bool,
  }),
};

export const robotLineRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/robot-lines",
    tag: TAG,
    operationId: "listRobotLines",
    summary: "List robot lines",
    description: "In display order. Hidden lines are included unless `visible=true`.",
    scope: "read",
    queryParams: [{ name: "visible", description: "`true` to return visible lines only.", enum: ["true", "false"] }],
    returns: "Robot lines.",
    response: listOf(ref("RobotLine")),
    async handler({ repos, query }) {
      return repos.robotLines.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/robot-lines/{id}",
    tag: TAG,
    operationId: "getRobotLine",
    summary: "Get a robot line",
    scope: "read",
    returns: "The robot line.",
    response: ref("RobotLine"),
    async handler({ repos }, { id }) {
      const line = await repos.robotLines.getById(id!);
      if (!line) throw notFound("Robot line");
      return line;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/robot-lines",
    tag: TAG,
    operationId: "createRobotLine",
    summary: "Create a robot line",
    description: "`text` is one short sentence (max 160 characters). `position` defaults to 0, `isVisible` to true.",
    scope: "write",
    body: robotLineCreateSchema,
    returns: "The created robot line.",
    response: ref("RobotLine"),
    async handler({ repos }, _params, input) {
      return repos.robotLines.create(input);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/robot-lines/{id}",
    tag: TAG,
    operationId: "updateRobotLine",
    summary: "Update a robot line",
    description: "Send only the fields to change.",
    scope: "write",
    body: robotLineUpdateSchema,
    returns: "The updated robot line.",
    response: ref("RobotLine"),
    async handler({ repos }, { id }, input) {
      return repos.robotLines.update(id!, input);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/robot-lines/{id}",
    tag: TAG,
    operationId: "deleteRobotLine",
    summary: "Delete a robot line",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.robotLines.delete(id!))) throw notFound("Robot line");
      return null;
    },
  }),
];
