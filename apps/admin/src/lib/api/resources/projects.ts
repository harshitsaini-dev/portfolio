/**
 * `/projects` — mirrors `lib/actions/projects.ts`.
 *
 * Same schemas, same repository calls, same relation semantics: in an update,
 * an omitted list is left alone, `[]` clears it, anything else replaces it.
 */

import type { Repositories } from "@portfolio/database";
import {
  projectCreateSchema,
  projectUpdateSchema,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "@portfolio/schemas";
import { PROJECT_STATUSES, type ProjectStatus } from "@portfolio/types";

import { badRequest, defineRoute, listOf, notFound, ref, type ApiRoute } from "../define.ts";

const TAG = "Projects";

async function withRelations(repos: Repositories, id: string) {
  const project = await repos.projects.getById(id);
  if (!project) throw notFound("Project");
  const full = await repos.projects.getBySlugWithRelations(project.slug);
  if (!full) throw notFound("Project");
  return full;
}

async function applyRelations(
  repos: Repositories,
  projectId: string,
  input: Pick<ProjectCreateInput | ProjectUpdateInput, "links" | "technologyIds" | "media">,
): Promise<void> {
  if (input.links) {
    await repos.projects.setLinks(
      projectId,
      input.links.map((link, index) => ({ label: link.label, url: link.url, kind: link.kind, position: index })),
    );
  }
  if (input.technologyIds) {
    await repos.projects.setTechnologies(projectId, input.technologyIds);
  }
  if (input.media) {
    await repos.projects.setMedia(
      projectId,
      input.media.map((item, index) => ({ mediaAssetId: item.mediaAssetId, caption: item.caption, position: index })),
    );
  }
}

function parseStatuses(raw: string | null): ProjectStatus[] | undefined {
  if (raw === null || raw === "") return undefined;
  const values = raw.split(",");
  for (const value of values) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(value)) {
      throw badRequest(`Unknown status "${value}". Use: ${PROJECT_STATUSES.join(", ")}.`);
    }
  }
  return values as ProjectStatus[];
}

export const projectRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/projects",
    tag: TAG,
    operationId: "listProjects",
    summary: "List projects",
    description: "Every project, in display order, with links, gallery and technologies attached.",
    scope: "read",
    queryParams: [
      { name: "status", description: "Comma-separated filter, e.g. `published` or `draft,archived`." },
      { name: "featured", description: "`true` to return featured projects only.", enum: ["true", "false"] },
    ],
    returns: "Projects with relations.",
    response: listOf(ref("ProjectWithRelations")),
    async handler({ repos, query }) {
      return repos.projects.listWithRelations({
        statuses: parseStatuses(query.get("status")),
        featuredOnly: query.get("featured") === "true",
      });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/projects/{id}",
    tag: TAG,
    operationId: "getProject",
    summary: "Get a project",
    scope: "read",
    returns: "The project with relations.",
    response: ref("ProjectWithRelations"),
    async handler({ repos }, { id }) {
      return withRelations(repos, id!);
    },
  }),

  defineRoute({
    method: "GET",
    path: "/projects/by-slug/{slug}",
    tag: TAG,
    operationId: "getProjectBySlug",
    summary: "Get a project by its slug",
    scope: "read",
    returns: "The project with relations.",
    response: ref("ProjectWithRelations"),
    async handler({ repos }, { slug }) {
      const project = await repos.projects.getBySlugWithRelations(slug!);
      if (!project) throw notFound("Project");
      return project;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/projects",
    tag: TAG,
    operationId: "createProject",
    summary: "Create a project",
    description:
      "`technologyIds` must name existing technologies (`GET /technologies`); `media[].mediaAssetId`, `iconMediaId` and `coverMediaId` must name existing media (`GET /media`). `links`, `technologyIds` and `media` are stored in the order given. New projects default to `status: \"draft\"` — set `\"published\"` to show it on the site.",
    scope: "write",
    body: projectCreateSchema,
    returns: "The created project with relations.",
    response: ref("ProjectWithRelations"),
    async handler({ repos }, _params, input) {
      const project = await repos.projects.create({
        title: input.title,
        slug: input.slug,
        summary: input.summary,
        description: input.description,
        accent: input.accent,
        problem: input.problem,
        solution: input.solution,
        learnings: input.learnings,
        status: input.status,
        isFeatured: input.isFeatured,
        position: input.position,
        periodLabel: input.periodLabel,
        startedOn: input.startedOn,
        completedOn: input.completedOn,
        iconMediaId: input.iconMediaId,
        coverMediaId: input.coverMediaId,
      });
      try {
        await applyRelations(repos, project.id, input);
      } catch (error) {
        // The row and its relations are separate writes, so a bad reference
        // (an unknown technology or media id) fails *after* the project
        // exists. Measured: without this, a 409 left a half-made draft
        // behind. Undo it, so a refused create leaves nothing.
        await repos.projects.delete(project.id).catch((cleanup: unknown) => {
          console.error("[api] could not remove a half-created project", cleanup);
        });
        throw error;
      }
      return withRelations(repos, project.id);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/projects/{id}",
    tag: TAG,
    operationId: "updateProject",
    summary: "Update a project",
    description:
      "Send only the fields to change. For `links`, `technologyIds` and `media`: omit to keep, `[]` to clear, a list to replace.",
    scope: "write",
    body: projectUpdateSchema,
    returns: "The updated project with relations.",
    response: ref("ProjectWithRelations"),
    async handler({ repos }, { id }, input) {
      const project = await repos.projects.update(id!, {
        title: input.title,
        slug: input.slug,
        summary: input.summary,
        description: input.description,
        accent: input.accent,
        problem: input.problem,
        solution: input.solution,
        learnings: input.learnings,
        status: input.status,
        isFeatured: input.isFeatured,
        position: input.position,
        periodLabel: input.periodLabel,
        startedOn: input.startedOn,
        completedOn: input.completedOn,
        iconMediaId: input.iconMediaId,
        coverMediaId: input.coverMediaId,
      });
      await applyRelations(repos, project.id, input);
      return withRelations(repos, project.id);
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/projects/{id}",
    tag: TAG,
    operationId: "deleteProject",
    summary: "Delete a project",
    description: "Also removes its links, gallery attachments and technology tags. Media files themselves are kept.",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.projects.delete(id!))) throw notFound("Project");
      return null;
    },
  }),
];
