/**
 * Convenience endpoints over existing resources: a flat skill list, file
 * downloads, inbox counts, and publish/unpublish shortcuts.
 *
 * Each is a thin layer over the same repository calls the resource's own
 * endpoints use. They exist because an agent or script asks these questions
 * often, and "read the parent, filter, resend" is three chances to get it
 * wrong.
 *
 * Route order matters for `/inbox/stats`: the router takes the first match,
 * so these are registered before the `{id}` routes they would otherwise be
 * mistaken for (see `index.ts`).
 */

import type { Repositories } from "@portfolio/database";
import { CONTACT_MESSAGE_STATUSES } from "@portfolio/types";

import { ApiError, badRequest, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { listAllContactMessages } from "../../inbox/all-messages.ts";
import { getAdminStorage, StorageUnavailableError } from "../../storage/binding.ts";

// ---------------------------------------------------------------------------
// Publish shortcuts
// ---------------------------------------------------------------------------

type Publishable = "projects" | "notes";

function statusRoute(
  collection: Publishable,
  action: "publish" | "unpublish" | "archive",
): ApiRoute {
  const status = action === "publish" ? "published" : action === "unpublish" ? "draft" : "archived";
  const singular = collection === "projects" ? "project" : "note";
  const Singular = collection === "projects" ? "Project" : "Note";
  return defineRoute({
    method: "POST",
    path: `/${collection}/{id}/${action}`,
    tag: collection === "projects" ? "Projects" : "Notes",
    operationId: `${action}${Singular}`,
    summary: `${action[0]!.toUpperCase()}${action.slice(1)} a ${singular}`,
    description: `Sets \`status\` to \`"${status}"\` — the same as \`PATCH /${collection}/{id}\` with \`{ "status": "${status}" }\`. Idempotent.`,
    scope: "write",
    successStatus: 200,
    returns: `The ${singular}.`,
    response: ref(collection === "projects" ? "Project" : "Note"),
    async handler({ repos }, { id }) {
      const repository = collection === "projects" ? repos.projects : repos.notes;
      if (!(await repository.getById(id!))) throw notFound(Singular);
      return repository.update(id!, { status });
    },
  });
}

// ---------------------------------------------------------------------------
// Inbox stats
// ---------------------------------------------------------------------------

const inboxStatsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["total", ...CONTACT_MESSAGE_STATUSES],
  properties: Object.fromEntries([
    ["total", { type: "integer" }],
    ...CONTACT_MESSAGE_STATUSES.map((status) => [status, { type: "integer" }]),
  ]),
};

async function inboxStats(repos: Repositories) {
  const messages = await listAllContactMessages(repos.contactMessages);
  const counts: Record<string, number> = Object.fromEntries(CONTACT_MESSAGE_STATUSES.map((status) => [status, 0]));
  for (const message of messages) counts[message.status] = (counts[message.status] ?? 0) + 1;
  return { total: messages.length, ...counts };
}

// ---------------------------------------------------------------------------

/** Registered before the `{id}` routes of the same collections. */
export const priorityExtraRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/inbox/stats",
    tag: "Inbox",
    operationId: "getInboxStats",
    summary: "Count messages by status",
    description: "How many messages there are in total and in each status — e.g. to show an unread badge without reading the messages.",
    scope: "inbox",
    returns: "Counts.",
    response: inboxStatsSchema,
    async handler({ repos }) {
      return inboxStats(repos);
    },
  }),
];

export const extraRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/skills",
    tag: "Skills",
    operationId: "listSkills",
    summary: "List skills (all categories)",
    description: "Every skill as a flat list, ordered by category then position. Filter with `categoryId`.",
    scope: "read",
    queryParams: [{ name: "categoryId", description: "Only skills in this category." }],
    returns: "Skills.",
    response: listOf(ref("Skill")),
    async handler({ repos, query }) {
      const categoryId = query.get("categoryId");
      if (categoryId !== null) {
        if (!(await repos.skills.getById(categoryId))) throw badRequest("No skill category has that `categoryId`.");
        return repos.skills.listSkills(categoryId);
      }
      const categories = await repos.skills.listWithSkills();
      return categories.flatMap((category) => category.skills);
    },
  }),

  defineRoute({
    method: "GET",
    path: "/media/{id}/file",
    tag: "Media",
    operationId: "downloadMedia",
    summary: "Download a media file",
    description:
      "The stored bytes, with the stored content type. Works for every asset, whether or not the public site serves it — use the asset's `downloadUrl` for public links instead.",
    scope: "read",
    returns: "The file.",
    binaryResponse: true,
    async handler({ repos }, { id }) {
      const asset = await repos.media.getById(id!);
      if (!asset) throw notFound("Media asset");
      let storage;
      try {
        storage = await getAdminStorage();
      } catch (error) {
        if (error instanceof StorageUnavailableError) {
          console.error("[api] media storage unavailable", error);
          throw new ApiError(503, "storage_unavailable", "File storage is not available right now.");
        }
        throw error;
      }
      const object = await storage.get(asset.storageKey);
      if (!object) {
        // The record exists and the bytes do not: worth a log line, and a 404
        // rather than a 500 for the caller — there is nothing to retry.
        console.error(`[api] media ${asset.id} has no stored object at ${asset.storageKey}`);
        throw notFound("Media file");
      }
      const bytes = await object.arrayBuffer();
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": asset.contentType,
          "content-length": String(bytes.byteLength),
          "cache-control": "no-store, private",
          "x-content-type-options": "nosniff",
          // Never rendered inline from the admin's origin: a stored file is
          // user-supplied content.
          "content-disposition": `attachment; filename="${asset.id}"`,
        },
      });
    },
  }),

  statusRoute("projects", "publish"),
  statusRoute("projects", "unpublish"),
  statusRoute("projects", "archive"),
  statusRoute("notes", "publish"),
  statusRoute("notes", "unpublish"),
  statusRoute("notes", "archive"),
];
