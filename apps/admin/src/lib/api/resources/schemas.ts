/**
 * JSON Schemas of what the API *returns*, one per domain entity.
 *
 * Request bodies are generated from the shared Zod schemas; responses cannot
 * be, because the domain types in `@portfolio/types` are TypeScript only and
 * vanish at runtime. So these are written by hand — and checked: the API test
 * suite reads real rows through the real routes and fails if a response has a
 * key these do not declare, or lacks one they require. Keep each schema in
 * step with its type in `packages/types/src/content.ts`.
 */

import type { JsonSchema } from "../define.ts";

const str = { type: "string" } as const;
const nstr = { type: "string", nullable: true } as const;
const int = { type: "integer" } as const;
const nint = { type: "integer", nullable: true } as const;
const bool = { type: "boolean" } as const;
const timestamp = { type: "string", format: "date-time" } as const;
const ntimestamp = { type: "string", format: "date-time", nullable: true } as const;

/** `id`, `createdAt`, `updatedAt` — on every stored entity. */
export const META = { id: str, createdAt: timestamp, updatedAt: timestamp } as const;

/**
 * An object schema where every listed property is required (the domain types
 * have no optional keys: absent values are `null`), and nothing else appears.
 */
export function entity(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    description,
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

export const primitives = { str, nstr, int, nint, bool, timestamp, ntimestamp };

const technology = entity("A technology tag (language, framework, tool) projects can reference.", {
  ...META,
  iconMediaId: nstr,
  name: str,
  slug: str,
  category: nstr,
});

const projectFields = {
  ...META,
  accent: { ...nstr, description: "Hex colour, or null to follow the site accent." },
  iconMediaId: nstr,
  coverMediaId: nstr,
  slug: str,
  title: str,
  summary: str,
  description: nstr,
  problem: nstr,
  solution: nstr,
  learnings: nstr,
  status: { type: "string", enum: ["draft", "published", "archived"] },
  isFeatured: bool,
  position: int,
  periodLabel: nstr,
  startedOn: { ...nstr, description: "YYYY-MM-DD" },
  completedOn: { ...nstr, description: "YYYY-MM-DD" },
  publishedAt: ntimestamp,
} as const;

const projectLink = entity("A link shown on a project.", {
  id: str,
  projectId: str,
  label: str,
  url: str,
  kind: { type: "string", enum: ["repository", "live", "case_study", "documentation", "package", "other"] },
  position: int,
});

const projectMediaItem = entity("An image in a project's gallery.", {
  id: str,
  projectId: str,
  mediaAssetId: str,
  caption: nstr,
  position: int,
});

/**
 * Every entity schema, by name. Resource modules add theirs here; the
 * OpenAPI document publishes all of them under `components.schemas`.
 */
export const ENTITY_SCHEMAS: Record<string, JsonSchema> = {
  Technology: technology,
  Project: entity("A portfolio project, without its relations.", projectFields),
  ProjectLink: projectLink,
  ProjectMediaItem: projectMediaItem,
  ProjectWithRelations: entity("A portfolio project with its links, gallery and technologies.", {
    ...projectFields,
    links: { type: "array", items: { $ref: "#/components/schemas/ProjectLink" } },
    media: { type: "array", items: { $ref: "#/components/schemas/ProjectMediaItem" } },
    technologies: { type: "array", items: { $ref: "#/components/schemas/Technology" } },
  }),
};
