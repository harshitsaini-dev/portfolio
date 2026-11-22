/**
 * `/technologies` — mirrors `lib/actions/technologies.ts`.
 *
 * Technologies are the tags projects reference by id (`technologyIds` on
 * `POST /projects`). Deleting one that a project still uses is refused (409).
 */

import { ConflictError } from "@portfolio/database";
import { technologyCreateSchema, technologyUpdateSchema } from "@portfolio/schemas";

import { conflict, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";

const TAG = "Technologies";

const SLUG_TAKEN = "That slug is already used by another technology.";

/** `Technology` is declared in `schemas.ts`; nothing new here. */
export const technologySchemas: Record<string, JsonSchema> = {};

/** Re-throw a repository conflict with wording a caller can act on. */
async function withConflictMessage<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) throw conflict(message);
    throw error;
  }
}

export const technologyRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/technologies",
    tag: TAG,
    operationId: "listTechnologies",
    summary: "List technologies",
    description: "Every technology tag. Use an `id` from here in a project's `technologyIds`.",
    scope: "read",
    returns: "Technologies.",
    response: listOf(ref("Technology")),
    async handler({ repos }) {
      return repos.technologies.list();
    },
  }),

  defineRoute({
    method: "GET",
    path: "/technologies/usage",
    tag: TAG,
    operationId: "getTechnologyUsage",
    summary: "Count projects per technology",
    description: "How many projects reference each technology, keyed by technology id. Technologies used by no project are absent.",
    scope: "read",
    returns: "Map of technology id → project count.",
    response: { type: "object", additionalProperties: { type: "integer" } },
    async handler({ repos }) {
      return repos.projects.countByTechnology();
    },
  }),

  defineRoute({
    method: "GET",
    path: "/technologies/{id}",
    tag: TAG,
    operationId: "getTechnology",
    summary: "Get a technology",
    scope: "read",
    returns: "The technology.",
    response: ref("Technology"),
    async handler({ repos }, { id }) {
      const technology = await repos.technologies.getById(id!);
      if (!technology) throw notFound("Technology");
      return technology;
    },
  }),

  defineRoute({
    method: "GET",
    path: "/technologies/by-slug/{slug}",
    tag: TAG,
    operationId: "getTechnologyBySlug",
    summary: "Get a technology by its slug",
    scope: "read",
    returns: "The technology.",
    response: ref("Technology"),
    async handler({ repos }, { slug }) {
      const technology = await repos.technologies.getBySlug(slug!);
      if (!technology) throw notFound("Technology");
      return technology;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/technologies",
    tag: TAG,
    operationId: "createTechnology",
    summary: "Create a technology",
    description: "`slug` must be unique (409 otherwise). `iconMediaId`, if given, must name an existing media asset (`GET /media`).",
    scope: "write",
    body: technologyCreateSchema,
    returns: "The created technology.",
    response: ref("Technology"),
    async handler({ repos }, _params, input) {
      return withConflictMessage(SLUG_TAKEN, () =>
        repos.technologies.create({
          name: input.name,
          slug: input.slug,
          category: input.category,
          iconMediaId: input.iconMediaId,
        }),
      );
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/technologies/{id}",
    tag: TAG,
    operationId: "updateTechnology",
    summary: "Update a technology",
    description: "Send only the fields to change.",
    scope: "write",
    body: technologyUpdateSchema,
    returns: "The updated technology.",
    response: ref("Technology"),
    async handler({ repos }, { id }, input) {
      return withConflictMessage(SLUG_TAKEN, () =>
        repos.technologies.update(id!, {
          name: input.name,
          slug: input.slug,
          category: input.category,
          iconMediaId: input.iconMediaId,
        }),
      );
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/technologies/{id}",
    tag: TAG,
    operationId: "deleteTechnology",
    summary: "Delete a technology",
    description: "Refused with 409 while any project still uses it — remove it from those projects first (`PATCH /projects/{id}` with a new `technologyIds`). `GET /technologies/usage` shows which are in use.",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      const deleted = await withConflictMessage(
        "This technology is still used by one or more projects. Remove it from them first.",
        () => repos.technologies.delete(id!),
      );
      if (!deleted) throw notFound("Technology");
      return null;
    },
  }),
];
