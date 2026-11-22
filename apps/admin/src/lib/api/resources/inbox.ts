/**
 * `/inbox` â€” mirrors `lib/actions/inbox.ts`.
 *
 * Every route here, reads included, needs the `inbox` permission: these are
 * other people's names, addresses and phone numbers, not the owner's content,
 * and a key granted `read` for a build script has no business seeing them.
 *
 * There is no create. Messages arrive from the public contact form; an API
 * that could author one could put something in the inbox that nobody sent â€”
 * the same reason `@portfolio/schemas` has no create schema for them.
 *
 * Unlike the content lists, this one is paginated: an inbox grows without
 * bound, and the repository caps a page at 500 rows.
 */

import { contactMessageStatusUpdateSchema } from "@portfolio/schemas";
import { CONTACT_MESSAGE_STATUSES, type ContactMessageStatus } from "@portfolio/types";

import { badRequest, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, primitives } from "./schemas.ts";

const TAG = "Inbox";

const { str, nstr, timestamp, ntimestamp } = primitives;

export const inboxSchemas: Record<string, JsonSchema> = {
  ContactMessage: entity("A message sent through the public contact form.", {
    id: str,
    senderName: str,
    senderEmail: nstr,
    senderPhone: nstr,
    senderPhoneCountry: nstr,
    subject: nstr,
    body: str,
    status: { type: "string", enum: [...CONTACT_MESSAGE_STATUSES] },
    sourceCountry: { ...nstr, description: "Two-letter country code the message was sent from, when known." },
    createdAt: timestamp,
    readAt: { ...ntimestamp, description: "When it was first marked `read`." },
  }),
};

function parseStatuses(raw: string | null): ContactMessageStatus[] | undefined {
  if (raw === null || raw === "") return undefined;
  const values = raw.split(",");
  for (const value of values) {
    if (!(CONTACT_MESSAGE_STATUSES as readonly string[]).includes(value)) {
      throw badRequest(`Unknown status "${value}". Use: ${CONTACT_MESSAGE_STATUSES.join(", ")}.`);
    }
  }
  return values as ContactMessageStatus[];
}

function parseCount(raw: string | null, name: string, min: number, max: number): number | undefined {
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`\`${name}\` must be an integer from ${min} to ${max}.`);
  }
  return value;
}

export const inboxRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/inbox",
    tag: TAG,
    operationId: "listMessages",
    summary: "List contact messages",
    description: "Newest first. Paginated with `limit` (default 100, max 500) and `offset`.",
    scope: "inbox",
    queryParams: [
      { name: "status", description: `Comma-separated filter: ${CONTACT_MESSAGE_STATUSES.join(", ")}.` },
      { name: "limit", description: "Page size, 1–500. Default 100." },
      { name: "offset", description: "Rows to skip. Default 0." },
    ],
    returns: "Contact messages.",
    response: listOf(ref("ContactMessage")),
    async handler({ repos, query }) {
      return repos.contactMessages.list({
        statuses: parseStatuses(query.get("status")),
        limit: parseCount(query.get("limit"), "limit", 1, 500),
        offset: parseCount(query.get("offset"), "offset", 0, Number.MAX_SAFE_INTEGER),
      });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/inbox/{id}",
    tag: TAG,
    operationId: "getMessage",
    summary: "Get a contact message",
    description: "Reading a message does **not** mark it read — send `PATCH` with `{\"status\": \"read\"}` for that.",
    scope: "inbox",
    returns: "The message.",
    response: ref("ContactMessage"),
    async handler({ repos }, { id }) {
      const message = await repos.contactMessages.getById(id!);
      if (!message) throw notFound("Message");
      return message;
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/inbox/{id}",
    tag: TAG,
    operationId: "setMessageStatus",
    summary: "Change a message's status",
    description: "The only editable field is `status`. The first change to `read` stamps `readAt`.",
    scope: "inbox",
    body: contactMessageStatusUpdateSchema,
    returns: "The updated message.",
    response: ref("ContactMessage"),
    async handler({ repos }, { id }, input) {
      return repos.contactMessages.setStatus(id!, input.status);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/inbox/{id}",
    tag: TAG,
    operationId: "deleteMessage",
    summary: "Delete a contact message",
    description: "Permanent. Prefer `status: \"archived\"` or `\"spam\"` unless it must be gone.",
    scope: "inbox",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.contactMessages.delete(id!))) throw notFound("Message");
      return null;
    },
  }),
];
