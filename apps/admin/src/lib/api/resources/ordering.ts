/**
 * `PUT …/order` for every collection with a `position`.
 *
 * Each reuses its collection's own GET list route (found by operationId, so a
 * renamed route fails loudly at import rather than serving a stale shape).
 * See `order.ts` for the rule.
 */

import type { ApiRoute } from "../define.ts";
import { certificationRoutes } from "./certifications.ts";
import { educationRoutes } from "./education.ts";
import { noteRoutes } from "./notes.ts";
import { orderRoute } from "./order.ts";
import { projectRoutes } from "./projects.ts";
import { robotLineRoutes } from "./robot-lines.ts";
import { sectionRoutes } from "./sections.ts";
import { skillRoutes } from "./skills.ts";
import { socialRoutes } from "./socials.ts";
import { terminalLineRoutes } from "./terminal-lines.ts";
import { timelineRoutes } from "./timeline.ts";
import { toolRoutes } from "./tools.ts";

function route(routes: readonly ApiRoute[], operationId: string): ApiRoute {
  const found = routes.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`ordering: no route named ${operationId}`);
  return found;
}

export const orderingRoutes: ApiRoute[] = [
  orderRoute({
    listRoute: route(projectRoutes, "listProjects"),
    noun: "projects",
    operationId: "reorderProjects",
    rows: (repos) => repos.projects.list(),
    setPosition: (repos, id, position) => repos.projects.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(timelineRoutes, "listTimelineEntries"),
    noun: "timeline entries",
    operationId: "reorderTimelineEntries",
    rows: (repos) => repos.timeline.list(),
    setPosition: (repos, id, position) => repos.timeline.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(educationRoutes, "listEducationEntries"),
    noun: "education entries",
    operationId: "reorderEducationEntries",
    rows: (repos) => repos.education.list(),
    setPosition: (repos, id, position) => repos.education.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(certificationRoutes, "listCertifications"),
    noun: "certifications",
    operationId: "reorderCertifications",
    rows: (repos) => repos.certifications.list(),
    setPosition: (repos, id, position) => repos.certifications.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(skillRoutes, "listSkillCategories"),
    noun: "skill categories",
    operationId: "reorderSkillCategories",
    rows: (repos) => repos.skills.list(),
    setPosition: (repos, id, position) => repos.skills.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(skillRoutes, "listSkillsInCategory"),
    noun: "skills in this category",
    operationId: "reorderSkillsInCategory",
    rows: (repos, params) => repos.skills.listSkills(params.id!),
    setPosition: (repos, id, position) => repos.skills.updateSkill(id, { position }),
  }),
  orderRoute({
    listRoute: route(toolRoutes, "listTools"),
    noun: "tools",
    operationId: "reorderTools",
    rows: (repos) => repos.tools.list(),
    setPosition: (repos, id, position) => repos.tools.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(socialRoutes, "listSocialLinks"),
    noun: "social links",
    operationId: "reorderSocialLinks",
    rows: (repos) => repos.socialLinks.list(),
    setPosition: (repos, id, position) => repos.socialLinks.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(sectionRoutes, "listSections"),
    noun: "sections",
    operationId: "reorderSections",
    rows: (repos) => repos.sections.list(),
    setPosition: (repos, id, position) => repos.sections.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(robotLineRoutes, "listRobotLines"),
    noun: "robot lines",
    operationId: "reorderRobotLines",
    rows: (repos) => repos.robotLines.list(),
    setPosition: (repos, id, position) => repos.robotLines.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(terminalLineRoutes, "listTerminalLines"),
    noun: "terminal lines",
    operationId: "reorderTerminalLines",
    rows: (repos) => repos.terminalLines.list(),
    setPosition: (repos, id, position) => repos.terminalLines.update(id, { position }),
  }),
  orderRoute({
    listRoute: route(noteRoutes, "listNotes"),
    noun: "notes",
    operationId: "reorderNotes",
    rows: (repos) => repos.notes.list(),
    setPosition: (repos, id, position) => repos.notes.update(id, { position }),
  }),
];
