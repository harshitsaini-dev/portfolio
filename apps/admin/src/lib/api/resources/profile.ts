/**
 * `/profile` — the singleton "about me". Mirrors `lib/actions/profile.ts`.
 *
 * The response carries `headlineAlternates` as plain strings, in order —
 * the shape the admin form edits and the shape `PUT`/`PATCH` accept — so a
 * client can GET, change a field, and send it straight back.
 *
 * There is no DELETE: the admin offers no way to clear the profile either.
 */

import type { Repositories } from "@portfolio/database";
import { profileSaveSchema, type ProfileSaveInput } from "@portfolio/schemas";

import { defineRoute, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { patchSchemaOf, sentKeys, validateMerged } from "./patch.ts";
import { entity, META, primitives } from "./schemas.ts";

const { str, nstr, bool } = primitives;
const TAG = "Profile";

async function readProfile(repos: Repositories) {
  const [profile, alternates] = await Promise.all([
    repos.profile.get(),
    repos.headlineAlternates.list(),
  ]);
  if (!profile) return null;
  return { ...profile, headlineAlternates: alternates.map((alternate) => alternate.text) };
}

/** Same field list as `saveProfileAction`. */
async function save(repos: Repositories, input: ProfileSaveInput, replaceAlternates: boolean) {
  await repos.profile.upsert({
    fullName: input.fullName,
    headline: input.headline,
    tagline: input.tagline,
    bio: input.bio,
    location: input.location,
    availability: input.availability,
    publicEmail: input.publicEmail,
    publicPhone: input.publicPhone,
    isPublicEmailVisible: input.isPublicEmailVisible,
    isWhatsappVisible: input.isWhatsappVisible,
    avatarMediaId: input.avatarMediaId,
    xrayMediaId: input.xrayMediaId,
  });
  // `replaceAll` rebuilds the rows, so it only runs when the caller actually
  // sent the list — a PATCH of the bio must not churn the alternates.
  if (replaceAlternates) {
    await repos.headlineAlternates.replaceAll(input.headlineAlternates);
  }
  return readProfile(repos);
}

export const profileSchemas: Record<string, JsonSchema> = {
  Profile: entity("The site owner's profile, with the rotating headline alternates.", {
    ...META,
    avatarMediaId: nstr,
    xrayMediaId: nstr,
    fullName: str,
    headline: str,
    headlineAlternates: {
      type: "array",
      items: str,
      description: "Extra headlines the hero rotates through, in order.",
    },
    tagline: nstr,
    bio: nstr,
    location: nstr,
    availability: nstr,
    publicEmail: nstr,
    publicPhone: nstr,
    isPublicEmailVisible: bool,
    isWhatsappVisible: bool,
  }),
};

const profilePatchSchema = patchSchemaOf(profileSaveSchema);

export const profileRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/profile",
    tag: TAG,
    operationId: "getProfile",
    summary: "Get the profile",
    description: "`data` is `null` until a profile has been saved for the first time.",
    scope: "read",
    returns: "The profile, or null if none exists yet.",
    response: { allOf: [ref("Profile")], nullable: true },
    async handler({ repos }) {
      return readProfile(repos);
    },
  }),

  defineRoute({
    method: "PUT",
    path: "/profile",
    tag: TAG,
    operationId: "replaceProfile",
    summary: "Replace the whole profile",
    description:
      "Full replacement, exactly like saving the admin form: **every omitted field is reset to its default** (`null`, `true` for the visibility switches, `[]` for `headlineAlternates`). To change a few fields, use `PATCH /profile`. An empty string clears a text field. Media ids must name existing media (`GET /media`).",
    scope: "write",
    successStatus: 200,
    body: profileSaveSchema,
    returns: "The saved profile.",
    response: ref("Profile"),
    async handler({ repos }, _params, input) {
      return save(repos, input, true);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/profile",
    tag: TAG,
    operationId: "updateProfile",
    summary: "Update some profile fields",
    description:
      "Send only the fields to change; the rest keep their stored values. `null` or `\"\"` clears a nullable text field; `headlineAlternates` replaces the whole list when sent. If no profile exists yet, `fullName` and `headline` are required.",
    scope: "write",
    body: profilePatchSchema,
    returns: "The saved profile.",
    response: ref("Profile"),
    async handler({ repos }, _params, body) {
      const current = await readProfile(repos);
      const base: Record<string, unknown> = current
        ? {
            avatarMediaId: current.avatarMediaId,
            xrayMediaId: current.xrayMediaId,
            fullName: current.fullName,
            headline: current.headline,
            headlineAlternates: current.headlineAlternates,
            tagline: current.tagline,
            bio: current.bio,
            location: current.location,
            availability: current.availability,
            publicEmail: current.publicEmail,
            publicPhone: current.publicPhone,
            isPublicEmailVisible: current.isPublicEmailVisible,
            isWhatsappVisible: current.isWhatsappVisible,
          }
        : {};
      const sent = sentKeys(body);
      const input = validateMerged(profileSaveSchema, { ...base, ...sent });
      return save(repos, input, "headlineAlternates" in sent);
    },
  }),
];
