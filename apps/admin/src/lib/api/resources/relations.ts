/**
 * Child collections, addressable on their own.
 *
 * Everything here can also be done through the parent's PATCH; these exist so
 * a client that only cares about one list — "add a link to this project",
 * "replace this job's bullet points" — does not have to read and resend the
 * parent. Each PUT replaces the whole list (send `[]` to clear), and each
 * reuses the parent's own schema for the list, so the limits are identical.
 */

import type { Repositories } from "@portfolio/database";
import { projectUpdateSchema, timelineHighlightsReplaceSchema } from "@portfolio/schemas";

import { defineRoute, listOf, notFound, ref, type ApiRoute } from "../define.ts";

async function requireProject(repos: Repositories, id: string) {
  const project = await repos.projects.getById(id);
  if (!project) throw notFound("Project");
  return project;
}

async function requireTimelineEntry(repos: Repositories, id: string) {
  const entry = await repos.timeline.getById(id);
  if (!entry) throw notFound("Timeline entry");
  return entry;
}

const linksBody = projectUpdateSchema.pick({ links: true }).required();
const technologiesBody = projectUpdateSchema.pick({ technologyIds: true }).required();
const mediaBody = projectUpdateSchema.pick({ media: true }).required();

export const relationRoutes: ApiRoute[] = [
  // ---- Project links -------------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/projects/{id}/links",
    tag: "Projects",
    operationId: "listProjectLinks",
    summary: "List a project's links",
    scope: "read",
    returns: "The project's links, in display order.",
    response: listOf(ref("ProjectLink")),
    async handler({ repos }, { id }) {
      await requireProject(repos, id!);
      return repos.projects.listLinks(id!);
    },
  }),
  defineRoute({
    method: "PUT",
    path: "/projects/{id}/links",
    tag: "Projects",
    operationId: "replaceProjectLinks",
    summary: "Replace a project's links",
    description: "Body: `{ \"links\": [{ \"label\", \"url\", \"kind\" }] }`, in display order. `[]` removes them all.",
    scope: "write",
    body: linksBody,
    returns: "The project's links after the change.",
    response: listOf(ref("ProjectLink")),
    async handler({ repos }, { id }, input) {
      await requireProject(repos, id!);
      await repos.projects.setLinks(
        id!,
        input.links.map((link, index) => ({ label: link.label, url: link.url, kind: link.kind, position: index })),
      );
      return repos.projects.listLinks(id!);
    },
  }),

  // ---- Project technologies --------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/projects/{id}/technologies",
    tag: "Projects",
    operationId: "listProjectTechnologies",
    summary: "List a project's technologies",
    scope: "read",
    returns: "The technologies tagged on the project.",
    response: listOf(ref("Technology")),
    async handler({ repos }, { id }) {
      await requireProject(repos, id!);
      return repos.projects.listTechnologies(id!);
    },
  }),
  defineRoute({
    method: "PUT",
    path: "/projects/{id}/technologies",
    tag: "Projects",
    operationId: "replaceProjectTechnologies",
    summary: "Replace a project's technologies",
    description:
      "Body: `{ \"technologyIds\": [...] }` — ids from `GET /technologies`, in display order. `[]` removes them all. An unknown id is a 409 and nothing changes.",
    scope: "write",
    body: technologiesBody,
    returns: "The project's technologies after the change.",
    response: listOf(ref("Technology")),
    async handler({ repos }, { id }, input) {
      await requireProject(repos, id!);
      await repos.projects.setTechnologies(id!, input.technologyIds);
      return repos.projects.listTechnologies(id!);
    },
  }),

  // ---- Project gallery -------------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/projects/{id}/media",
    tag: "Projects",
    operationId: "listProjectMedia",
    summary: "List a project's gallery",
    scope: "read",
    returns: "The project's gallery items, in display order.",
    response: listOf(ref("ProjectMediaItem")),
    async handler({ repos }, { id }) {
      await requireProject(repos, id!);
      return repos.projects.listMedia(id!);
    },
  }),
  defineRoute({
    method: "PUT",
    path: "/projects/{id}/media",
    tag: "Projects",
    operationId: "replaceProjectMedia",
    summary: "Replace a project's gallery",
    description:
      "Body: `{ \"media\": [{ \"mediaAssetId\", \"caption\" }] }` — ids from `GET /media` (upload with `POST /media` first), in display order. `[]` empties the gallery; the files themselves are kept.",
    scope: "write",
    body: mediaBody,
    returns: "The project's gallery after the change.",
    response: listOf(ref("ProjectMediaItem")),
    async handler({ repos }, { id }, input) {
      await requireProject(repos, id!);
      await repos.projects.setMedia(
        id!,
        input.media.map((item, index) => ({ mediaAssetId: item.mediaAssetId, caption: item.caption, position: index })),
      );
      return repos.projects.listMedia(id!);
    },
  }),

  // ---- Timeline highlights ---------------------------------------------------
  defineRoute({
    method: "GET",
    path: "/timeline/{id}/highlights",
    tag: "Timeline",
    operationId: "listTimelineHighlights",
    summary: "List a timeline entry's highlights",
    scope: "read",
    returns: "The entry's highlights (bullet points), in order.",
    response: listOf(ref("TimelineHighlight")),
    async handler({ repos }, { id }) {
      await requireTimelineEntry(repos, id!);
      return repos.timeline.listHighlights(id!);
    },
  }),
  defineRoute({
    method: "PUT",
    path: "/timeline/{id}/highlights",
    tag: "Timeline",
    operationId: "replaceTimelineHighlights",
    summary: "Replace a timeline entry's highlights",
    description: "Body: `{ \"highlights\": [{ \"content\": \"...\" }] }`, in order. `[]` removes them all.",
    scope: "write",
    body: timelineHighlightsReplaceSchema,
    returns: "The entry's highlights after the change.",
    response: listOf(ref("TimelineHighlight")),
    async handler({ repos }, { id }, input) {
      await requireTimelineEntry(repos, id!);
      await repos.timeline.setHighlights(
        id!,
        input.highlights.map((highlight) => highlight.content),
      );
      return repos.timeline.listHighlights(id!);
    },
  }),

  // ---- Section alternates (read; the PUT lives in sections.ts) ---------------
  defineRoute({
    method: "GET",
    path: "/sections/{id}/alternates",
    tag: "Sections",
    operationId: "getSectionAlternates",
    summary: "Get a section's title/eyebrow alternates",
    scope: "read",
    returns: "The rotating alternates for the section's title and eyebrow.",
    response: ref("SectionAlternates"),
    async handler({ repos }, { id }) {
      if (!(await repos.sections.getById(id!))) throw notFound("Section");
      return repos.sections.getAlternates(id!);
    },
  }),
];
