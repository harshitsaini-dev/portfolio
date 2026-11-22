/**
 * Every `/api/v1` route, in the order the OpenAPI document lists them.
 *
 * Adding a resource: write `resources/<name>.ts` exporting `<name>Routes` and
 * `<name>Schemas`, then add both here. The router and the public document
 * both read these lists, and the API test suite checks every GET's real
 * response against its declared schema.
 *
 * Order matters in one way: the router takes the first route that matches,
 * so within a module a literal path (`/technologies/usage`,
 * `/resumes/current`) must come before the `{id}` route it would otherwise
 * be mistaken for. Each module keeps its own literals first.
 */

import type { ApiRoute, JsonSchema } from "../define.ts";
import { analyticsRoutes, analyticsSchemas } from "./analytics.ts";
import { certificationRoutes, certificationSchemas } from "./certifications.ts";
import { educationRoutes, educationSchemas } from "./education.ts";
import { extraRoutes, priorityExtraRoutes } from "./extras.ts";
import { headlineAlternateRoutes, headlineAlternateSchemas } from "./headline-alternates.ts";
import { inboxRoutes, inboxSchemas } from "./inbox.ts";
import { mediaRoutes, mediaSchemas } from "./media.ts";
import { metaRoutes } from "./meta.ts";
import { noteRoutes, noteSchemas } from "./notes.ts";
import { orderingRoutes } from "./ordering.ts";
import { profileRoutes, profileSchemas } from "./profile.ts";
import { projectRoutes } from "./projects.ts";
import { relationRoutes } from "./relations.ts";
import { resumeRoutes, resumeSchemas } from "./resumes.ts";
import { robotLineRoutes, robotLineSchemas } from "./robot-lines.ts";
import { ENTITY_SCHEMAS as CORE_SCHEMAS } from "./schemas.ts";
import { sectionRoutes, sectionSchemas } from "./sections.ts";
import { settingsRoutes, settingsSchemas } from "./settings.ts";
import { skillRoutes, skillSchemas } from "./skills.ts";
import { socialRoutes, socialSchemas } from "./socials.ts";
import { technologyRoutes, technologySchemas } from "./technologies.ts";
import { terminalLineRoutes, terminalLineSchemas } from "./terminal-lines.ts";
import { timelineRoutes, timelineSchemas } from "./timeline.ts";
import { toolRoutes, toolSchemas } from "./tools.ts";

const CONTENT_ROUTES: readonly ApiRoute[] = [
  // Literal paths that would otherwise match an `{id}` route come first.
  ...priorityExtraRoutes,
  ...profileRoutes,
  ...headlineAlternateRoutes,
  ...projectRoutes,
  ...technologyRoutes,
  ...timelineRoutes,
  ...educationRoutes,
  ...certificationRoutes,
  ...skillRoutes,
  ...toolRoutes,
  ...socialRoutes,
  ...sectionRoutes,
  ...robotLineRoutes,
  ...terminalLineRoutes,
  ...noteRoutes,
  ...mediaRoutes,
  ...resumeRoutes,
  ...settingsRoutes,
  ...inboxRoutes,
  ...analyticsRoutes,
  ...relationRoutes,
  ...orderingRoutes,
  ...extraRoutes,
];

/** `/me`, `/search` and `/export` first; `/export` reuses the routes above. */
export const API_ROUTES: readonly ApiRoute[] = [...metaRoutes(CONTENT_ROUTES), ...CONTENT_ROUTES];

const PARTS: readonly Readonly<Record<string, JsonSchema>>[] = [
  CORE_SCHEMAS,
  profileSchemas,
  headlineAlternateSchemas,
  technologySchemas,
  timelineSchemas,
  educationSchemas,
  certificationSchemas,
  skillSchemas,
  toolSchemas,
  socialSchemas,
  sectionSchemas,
  robotLineSchemas,
  terminalLineSchemas,
  noteSchemas,
  mediaSchemas,
  resumeSchemas,
  settingsSchemas,
  inboxSchemas,
  analyticsSchemas,
];

/**
 * Every response schema, by name. Built by merging, and refusing a name
 * declared twice — two modules disagreeing about what `Skill` looks like
 * would otherwise be settled silently by import order.
 */
export const ENTITY_SCHEMAS: Readonly<Record<string, JsonSchema>> = (() => {
  const merged: Record<string, JsonSchema> = {};
  for (const part of PARTS) {
    for (const [name, schema] of Object.entries(part)) {
      if (name in merged) throw new Error(`API schema "${name}" is declared twice`);
      merged[name] = schema;
    }
  }
  return merged;
})();
