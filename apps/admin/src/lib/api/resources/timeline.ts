/**
 * `/timeline` — mirrors `lib/actions/timeline.ts`.
 *
 * Work-experience entries, each with an ordered list of highlight bullets.
 * Highlights are sent as `[{ "content": "..." }]` and returned as full
 * `TimelineHighlight` objects. In an update, omitting `highlights` leaves them
 * alone, `[]` clears them, and a list replaces them wholesale.
 */

import type { Repositories } from "@portfolio/database";
import { timelineEntryCreateSchema, timelineEntryUpdateSchema } from "@portfolio/schemas";

import { defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, META, primitives } from "./schemas.ts";

const TAG = "Timeline";

const { str, nstr, int, bool } = primitives;

const entryFields = {
  ...META,
  iconMediaId: nstr,
  role: str,
  organization: str,
  summary: nstr,
  location: nstr,
  periodLabel: nstr,
  startedOn: { ...nstr, description: "YYYY-MM-DD" },
  endedOn: { ...nstr, description: "YYYY-MM-DD; null while current." },
  position: int,
  isVisible: bool,
};

export const timelineSchemas: Record<string, JsonSchema> = {
  TimelineHighlight: entity("One bullet point on a timeline entry.", {
    id: str,
    timelineEntryId: str,
    content: str,
    position: int,
  }),
  TimelineEntryWithHighlights: entity("A work-experience entry with its highlights.", {
    ...entryFields,
    highlights: { type: "array", items: { $ref: "#/components/schemas/TimelineHighlight" } },
  }),
};

/** One entry with its highlights. The repository has no single-entry read for this. */
async function withHighlights(repos: Repositories, id: string) {
  const entry = await repos.timeline.getById(id);
  if (!entry) throw notFound("Timeline entry");
  const highlights = await repos.timeline.listHighlights(entry.id);
  return { ...entry, highlights };
}

export const timelineRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/timeline",
    tag: TAG,
    operationId: "listTimelineEntries",
    summary: "List timeline entries",
    description:
      "Every work-experience entry in display order (`position`), with highlights. Hidden entries (`isVisible: false`) are included unless `visible=true`.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only entries shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Timeline entries with highlights.",
    response: listOf(ref("TimelineEntryWithHighlights")),
    async handler({ repos, query }) {
      return repos.timeline.listWithHighlights({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/timeline/{id}",
    tag: TAG,
    operationId: "getTimelineEntry",
    summary: "Get a timeline entry",
    scope: "read",
    returns: "The entry with highlights.",
    response: ref("TimelineEntryWithHighlights"),
    async handler({ repos }, { id }) {
      return withHighlights(repos, id!);
    },
  }),

  defineRoute({
    method: "POST",
    path: "/timeline",
    tag: TAG,
    operationId: "createTimelineEntry",
    summary: "Create a timeline entry",
    description:
      "`highlights` is an ordered list of `{ \"content\": \"...\" }`, stored in the order given. `endedOn` must not precede `startedOn`. `iconMediaId`, if given, must name an existing media asset (`GET /media`). New entries are visible by default.",
    scope: "write",
    body: timelineEntryCreateSchema,
    returns: "The created entry with highlights.",
    response: ref("TimelineEntryWithHighlights"),
    async handler({ repos }, _params, input) {
      const { highlights, ...entry } = input;
      return repos.timeline.createWithHighlights(
        entry,
        highlights.map((highlight) => highlight.content),
      );
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/timeline/{id}",
    tag: TAG,
    operationId: "updateTimelineEntry",
    summary: "Update a timeline entry",
    description:
      "Send only the fields to change. `highlights`: omit to keep, `[]` to clear, a list to replace all of them.",
    scope: "write",
    body: timelineEntryUpdateSchema,
    returns: "The updated entry with highlights.",
    response: ref("TimelineEntryWithHighlights"),
    async handler({ repos }, { id }, input) {
      const { highlights, ...patch } = input;
      if (highlights === undefined) {
        // Parent-only patch: the highlights are not touched.
        const updated = await repos.timeline.update(id!, patch);
        return withHighlights(repos, updated.id);
      }
      return repos.timeline.updateWithHighlights(
        id!,
        patch,
        highlights.map((highlight) => highlight.content),
      );
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/timeline/{id}",
    tag: TAG,
    operationId: "deleteTimelineEntry",
    summary: "Delete a timeline entry",
    description: "Its highlights are deleted with it.",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.timeline.delete(id!))) throw notFound("Timeline entry");
      return null;
    },
  }),
];
