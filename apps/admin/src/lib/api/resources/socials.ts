/**
 * `/social-links` — mirrors `lib/actions/socials.ts`: the profile's links to
 * GitHub, LinkedIn and the like.
 */

import { ConflictError } from "@portfolio/database";
import { socialLinkCreateSchema, socialLinkUpdateSchema } from "@portfolio/schemas";

import { conflict, defineRoute, listOf, notFound, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { META, entity, primitives } from "./schemas.ts";

const TAG = "Social links";
const { str, nstr, int, bool } = primitives;

const SAVE_CONFLICT = "This social link could not be saved. Please review the values and try again.";

export const socialSchemas: Record<string, JsonSchema> = {
  SocialLink: entity("A link to one of the owner's profiles elsewhere.", {
    ...META,
    iconMediaId: nstr,
    label: str,
    platform: { ...str, description: "Free text, e.g. \"github\", \"linkedin\"." },
    url: str,
    position: int,
    isVisible: bool,
  }),
};

async function withConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConflictError) throw conflict(SAVE_CONFLICT);
    throw error;
  }
}

export const socialRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/social-links",
    tag: TAG,
    operationId: "listSocialLinks",
    summary: "List social links",
    description: "Every social link, in display order.",
    scope: "read",
    queryParams: [
      { name: "visible", description: "`true` to return only rows shown on the public site.", enum: ["true", "false"] },
    ],
    returns: "Social links.",
    response: listOf(ref("SocialLink")),
    async handler({ repos, query }) {
      return repos.socialLinks.list({ visibleOnly: query.get("visible") === "true" });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/social-links/{id}",
    tag: TAG,
    operationId: "getSocialLink",
    summary: "Get a social link",
    scope: "read",
    returns: "The social link.",
    response: ref("SocialLink"),
    async handler({ repos }, { id }) {
      const link = await repos.socialLinks.getById(id!);
      if (!link) throw notFound("Social link");
      return link;
    },
  }),

  defineRoute({
    method: "POST",
    path: "/social-links",
    tag: TAG,
    operationId: "createSocialLink",
    summary: "Create a social link",
    description: "`url` must be an http(s) URL.",
    scope: "write",
    body: socialLinkCreateSchema,
    returns: "The created social link.",
    response: ref("SocialLink"),
    async handler({ repos }, _params, input) {
      return withConflict(() => repos.socialLinks.create(input));
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/social-links/{id}",
    tag: TAG,
    operationId: "updateSocialLink",
    summary: "Update a social link",
    description: "Send only the fields to change.",
    scope: "write",
    body: socialLinkUpdateSchema,
    returns: "The updated social link.",
    response: ref("SocialLink"),
    async handler({ repos }, { id }, input) {
      return withConflict(() => repos.socialLinks.update(id!, input));
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/social-links/{id}",
    tag: TAG,
    operationId: "deleteSocialLink",
    summary: "Delete a social link",
    scope: "write",
    returns: "Nothing.",
    async handler({ repos }, { id }) {
      if (!(await repos.socialLinks.delete(id!))) throw notFound("Social link");
      return null;
    },
  }),
];
