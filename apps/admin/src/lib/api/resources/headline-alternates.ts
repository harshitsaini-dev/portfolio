/**
 * `/headline-alternates` — the rotating phrasings of the profile headline.
 *
 * In the admin these are edited on the profile form, and saved with
 * `replaceAll` after the profile itself (`lib/actions/profile.ts`). Here they
 * are also reachable on their own, so a caller can change the rotation
 * without resending the whole profile. Same rule as the profile form: up to
 * 8 phrases, each 1-160 characters, validated by the profile schema itself.
 */

import { profileSaveSchema } from "@portfolio/schemas";

import { defineRoute, listOf, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { META, entity, primitives } from "./schemas.ts";

const TAG = "Headline alternates";
const { str, int, bool } = primitives;

export const headlineAlternateSchemas: Record<string, JsonSchema> = {
  HeadlineAlternate: entity("One alternative phrasing of the profile headline.", {
    ...META,
    text: str,
    position: int,
    isVisible: bool,
  }),
};

/** The profile form's own rule for the list, and nothing else. */
const replaceBody = profileSaveSchema.pick({ headlineAlternates: true });

export const headlineAlternateRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/headline-alternates",
    tag: TAG,
    operationId: "listHeadlineAlternates",
    summary: "List headline alternates",
    description: "The phrases the hero headline rotates through after the profile's `headline`, in order.",
    scope: "read",
    returns: "Headline alternates in rotation order.",
    response: listOf(ref("HeadlineAlternate")),
    async handler({ repos }) {
      return repos.headlineAlternates.list();
    },
  }),

  defineRoute({
    method: "PUT",
    path: "/headline-alternates",
    tag: TAG,
    operationId: "replaceHeadlineAlternates",
    summary: "Replace the headline alternates",
    description:
      "Replaces the whole list, in the order given. `{ \"headlineAlternates\": [] }` turns rotation off. Note that saving the profile also replaces this list.",
    scope: "write",
    body: replaceBody,
    returns: "The new list.",
    response: listOf(ref("HeadlineAlternate")),
    async handler({ repos }, _params, input) {
      await repos.headlineAlternates.replaceAll(input.headlineAlternates);
      return repos.headlineAlternates.list();
    },
  }),
];
