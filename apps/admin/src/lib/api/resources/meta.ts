/**
 * Endpoints about the API and the CMS as a whole: who am I, everything at
 * once, and find anything.
 */

import type { ApiContext, ApiRoute, JsonSchema, PathParams } from "../define.ts";
import { badRequest, defineRoute, listOf } from "../define.ts";
import { listAllContactMessages } from "../../inbox/all-messages.ts";
import { primitives } from "./schemas.ts";

const { str, nstr, ntimestamp, timestamp } = primitives;

const TAG = "Meta";

// ---------------------------------------------------------------------------
// /me
// ---------------------------------------------------------------------------

const meSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "prefix", "scopes", "createdAt", "expiresAt", "lastUsedAt"],
  properties: {
    name: str,
    prefix: { ...str, description: "The first characters of the key, as shown in the admin." },
    scopes: { type: "array", items: { type: "string", enum: ["read", "write", "inbox"] } },
    createdAt: timestamp,
    expiresAt: { ...ntimestamp, description: "Null if the key never expires." },
    lastUsedAt: ntimestamp,
  },
};

// ---------------------------------------------------------------------------
// /search
// ---------------------------------------------------------------------------

const SEARCH_TYPES = [
  "project",
  "note",
  "technology",
  "timeline",
  "education",
  "certification",
  "skill",
  "tool",
  "social-link",
  "section",
] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

interface SearchHit {
  readonly type: SearchType;
  readonly id: string;
  readonly title: string;
  readonly snippet: string | null;
  /** The API path that reads this record. */
  readonly path: string;
}

const searchHitSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id", "title", "snippet", "path"],
  properties: {
    type: { type: "string", enum: [...SEARCH_TYPES] },
    id: str,
    title: str,
    snippet: { ...nstr, description: "Up to ~160 characters around the first match, when it is not in the title." },
    path: { ...str, description: "API path that reads the record, e.g. `/projects/{id}`." },
  },
};

/** Up to ~160 characters around the first match in `text`. */
function snippetOf(text: string, needle: string): string {
  const at = text.toLowerCase().indexOf(needle);
  const start = Math.max(0, at - 60);
  const piece = text.slice(start, start + 160).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${piece}${start + 160 < text.length ? "…" : ""}`;
}

function hit(
  type: SearchType,
  id: string,
  title: string,
  path: string,
  fields: readonly (string | null)[],
  needle: string,
): SearchHit | null {
  if (title.toLowerCase().includes(needle)) return { type, id, title, snippet: null, path };
  for (const field of fields) {
    if (field && field.toLowerCase().includes(needle)) {
      return { type, id, title, snippet: snippetOf(field, needle), path };
    }
  }
  return null;
}

async function search(context: ApiContext, needle: string, types: ReadonlySet<SearchType>): Promise<SearchHit[]> {
  const { repos } = context;
  const want = (type: SearchType) => types.has(type);
  const [projects, notes, technologies, timeline, education, certifications, categories, tools, socials, sections] =
    await Promise.all([
      want("project") ? repos.projects.list() : [],
      want("note") ? repos.notes.list() : [],
      want("technology") ? repos.technologies.list() : [],
      want("timeline") ? repos.timeline.list() : [],
      want("education") ? repos.education.list() : [],
      want("certification") ? repos.certifications.list() : [],
      want("skill") ? repos.skills.listWithSkills() : [],
      want("tool") ? repos.tools.list() : [],
      want("social-link") ? repos.socialLinks.list() : [],
      want("section") ? repos.sections.list() : [],
    ]);

  const hits: (SearchHit | null)[] = [
    ...projects.map((p) =>
      hit("project", p.id, p.title, `/projects/${p.id}`, [p.slug, p.summary, p.description, p.problem, p.solution, p.learnings], needle),
    ),
    ...notes.map((n) => hit("note", n.id, n.title, `/notes/${n.id}`, [n.slug, n.summary, n.body], needle)),
    ...technologies.map((t) => hit("technology", t.id, t.name, `/technologies/${t.id}`, [t.slug, t.category], needle)),
    ...timeline.map((e) => hit("timeline", e.id, `${e.role} — ${e.organization}`, `/timeline/${e.id}`, [], needle)),
    ...education.map((e) => hit("education", e.id, `${e.qualification} — ${e.institution}`, `/education/${e.id}`, [], needle)),
    ...certifications.map((c) => hit("certification", c.id, `${c.title} — ${c.issuer}`, `/certifications/${c.id}`, [], needle)),
    ...categories.flatMap((category) =>
      category.skills.map((s) => hit("skill", s.id, s.name, `/skills/${s.id}`, [category.name], needle)),
    ),
    ...tools.map((t) => hit("tool", t.id, t.name, `/tools/${t.id}`, [], needle)),
    ...socials.map((s) => hit("social-link", s.id, s.label, `/social-links/${s.id}`, [s.platform, s.url], needle)),
    ...sections.map((s) => hit("section", s.id, s.title, `/sections/${s.id}`, [s.key, s.eyebrow, s.subtitle], needle)),
  ];
  return hits.filter((value): value is SearchHit => value !== null);
}

// ---------------------------------------------------------------------------
// /export
// ---------------------------------------------------------------------------

/**
 * What the export contains, and which GET produces each part. The export is
 * literally those handlers' results, so every part has exactly the shape (and
 * the published schema) of the endpoint that reads it on its own.
 */
const EXPORT_PARTS: readonly { readonly key: string; readonly operationId: string; readonly scope: "read" | "inbox" }[] = [
  { key: "profile", operationId: "getProfile", scope: "read" },
  { key: "headlineAlternates", operationId: "listHeadlineAlternates", scope: "read" },
  { key: "siteSettings", operationId: "getSiteSettings", scope: "read" },
  { key: "sceneSettings", operationId: "getSceneSettings", scope: "read" },
  { key: "sections", operationId: "listSections", scope: "read" },
  { key: "projects", operationId: "listProjects", scope: "read" },
  { key: "technologies", operationId: "listTechnologies", scope: "read" },
  { key: "timeline", operationId: "listTimelineEntries", scope: "read" },
  { key: "education", operationId: "listEducationEntries", scope: "read" },
  { key: "certifications", operationId: "listCertifications", scope: "read" },
  { key: "skillCategories", operationId: "listSkillCategories", scope: "read" },
  { key: "tools", operationId: "listTools", scope: "read" },
  { key: "socialLinks", operationId: "listSocialLinks", scope: "read" },
  { key: "robotLines", operationId: "listRobotLines", scope: "read" },
  { key: "terminalLines", operationId: "listTerminalLines", scope: "read" },
  { key: "notes", operationId: "listNotes", scope: "read" },
  { key: "media", operationId: "listMedia", scope: "read" },
  { key: "resumes", operationId: "listResumes", scope: "read" },
  { key: "contactMessages", operationId: "listMessages", scope: "inbox" },
];

type Handler = (context: ApiContext, params: PathParams) => Promise<unknown>;

/**
 * Builds the meta routes. Takes the finished route list because `/export`
 * reuses the other endpoints' handlers.
 */
export function metaRoutes(allRoutes: readonly ApiRoute[]): ApiRoute[] {
  const parts = EXPORT_PARTS.map((part) => {
    const route = allRoutes.find((candidate) => candidate.operationId === part.operationId);
    if (!route || route.method !== "GET") throw new Error(`export: no GET route named ${part.operationId}`);
    return { ...part, route };
  });

  const exportSchema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["formatVersion", "exportedAt", "content"],
    properties: {
      formatVersion: { type: "integer", enum: [1] },
      exportedAt: timestamp,
      content: {
        type: "object",
        additionalProperties: false,
        required: parts.filter((part) => part.scope === "read").map((part) => part.key),
        properties: Object.fromEntries(
          parts.map((part) => [
            part.key,
            part.scope === "inbox"
              ? { ...(part.route.response ?? {}), description: "Only present when the key also has the `inbox` permission." }
              : (part.route.response ?? {}),
          ]),
        ),
      },
    },
  };

  return [
    defineRoute({
      method: "GET",
      path: "/me",
      tag: TAG,
      operationId: "getCurrentKey",
      summary: "Describe the calling API key",
      description:
        "Which key this is and what it may do. Useful as a connectivity check, and for an agent to learn its own permissions before planning work.",
      scope: "any",
      returns: "The calling key, without the key itself.",
      response: meSchema,
      async handler({ key }) {
        return {
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
        };
      },
    }),

    defineRoute({
      method: "GET",
      path: "/search",
      tag: TAG,
      operationId: "searchContent",
      summary: "Search all content",
      description:
        "Case-insensitive substring search across projects, notes, technologies, timeline, education, certifications, skills, tools, social links and sections — drafts and hidden rows included. Title matches first. Each hit names the API `path` that reads the full record.",
      scope: "read",
      queryParams: [
        { name: "q", description: "What to look for. At least 2 characters." },
        { name: "types", description: `Comma-separated subset of: ${SEARCH_TYPES.join(", ")}. Default: all.` },
        { name: "limit", description: "Maximum hits, 1–100. Default 25." },
      ],
      returns: "Matching records, best first.",
      response: listOf(searchHitSchema),
      async handler(context) {
        const needle = (context.query.get("q") ?? "").trim().toLowerCase();
        if (needle.length < 2) throw badRequest("`q` must be at least 2 characters.");
        if (needle.length > 200) throw badRequest("`q` may be at most 200 characters.");

        const rawTypes = context.query.get("types");
        const types = new Set<SearchType>();
        for (const value of rawTypes ? rawTypes.split(",") : SEARCH_TYPES) {
          if (!(SEARCH_TYPES as readonly string[]).includes(value)) {
            throw badRequest(`Unknown type "${value}". Use: ${SEARCH_TYPES.join(", ")}.`);
          }
          types.add(value as SearchType);
        }

        const rawLimit = context.query.get("limit");
        const limit = rawLimit === null ? 25 : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest("`limit` must be an integer from 1 to 100.");

        const hits = await search(context, needle, types);
        // Stable: title hits (no snippet) first, each group in collection order.
        return [...hits.filter((h) => h.snippet === null), ...hits.filter((h) => h.snippet !== null)].slice(0, limit);
      },
    }),

    defineRoute({
      method: "GET",
      path: "/export",
      tag: TAG,
      operationId: "exportContent",
      summary: "Export everything",
      description:
        "The whole CMS in one response — each part is exactly what its own GET endpoint returns. Contact messages are included only when the key also has the `inbox` permission. Media records carry a `downloadUrl`; the files themselves are not embedded.",
      scope: "read",
      returns: "A snapshot of all content.",
      response: exportSchema,
      async handler(context) {
        const unfiltered = { ...context, query: new URLSearchParams() };
        const included = parts.filter((part) => part.scope === "read" || context.key.scopes.includes("inbox"));
        const values = await Promise.all(
          included.map((part) =>
            // The inbox list is paginated (100 by default); an export must
            // not stop at the first page.
            part.key === "contactMessages"
              ? listAllContactMessages(context.repos.contactMessages)
              : (part.route.handler as Handler)(unfiltered, {}),
          ),
        );
        return {
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          content: Object.fromEntries(included.map((part, index) => [part.key, values[index]])),
        };
      },
    }),
  ];
}

