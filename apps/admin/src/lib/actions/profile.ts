"use server";

/**
 * Profile mutation Server Action.
 *
 * The same four steps, in the same order, as the projects and technologies
 * actions — this is the established pattern, not a new one:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * ## One action, because the row's identity is fixed
 *
 * There is no create/update pair and no `id` parameter. `profile` is a
 * singleton-key table whose primary key is pinned to `'singleton'` by a
 * CHECK constraint, and `ProfileRepository.upsert()` is the only write. A
 * caller therefore cannot choose which profile it edits, cannot create a
 * second one, and cannot supply the key at all — the schema rejects the
 * field and the repository supplies it.
 *
 * ## Why this returns instead of redirecting
 *
 * Projects and technologies redirect to their list after a mutation because
 * the user has finished with a record. The profile is edited in place on a
 * single route, so redirecting would mean redirecting to the page the user
 * is already on. Instead the action revalidates that path — so the server
 * component re-reads the saved row and nothing renders stale — and returns
 * a `success` result the form uses to confirm the save.
 */

import { revalidatePath } from "next/cache";

import { ConflictError, NotFoundError } from "@portfolio/database";
import { profileSaveSchema } from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  conflictError,
  failureError,
  notFoundError,
  success,
  validationError,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

const PROFILE_PATH = "/profile";

/**
 * What a successful save reports back.
 *
 * `createdAt` lets the form distinguish the first save from a later one
 * without exposing the singleton key, which is an internal detail.
 */
export interface ProfileMutationData {
  readonly savedAt: string;
  readonly createdAt: string;
}

/** Flatten Zod issues into the form's field-name keyspace. */
function toFieldErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

/** Read the JSON payload the form submits, without trusting its shape. */
function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function saveProfileAction(
  _previous: ActionState<ProfileMutationData>,
  formData: FormData,
): Promise<ActionState<ProfileMutationData>> {
  await requireAdminIdentity();

  const parsed = profileSaveSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;

  let saved;
  try {
    const repos = await getAdminRepositories();
    // `upsert` creates the row on the first save and replaces its content
    // afterwards, preserving `created_at`. The singleton key is the
    // repository's to supply — it is not in the validated input at all.
    saved = await repos.profile.upsert({
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
    // The rotation list is replaced wholesale, after the profile itself.
    //
    // Deliberately a second write rather than part of the upsert: the
    // alternates live in their own table, and the profile is the meaningful
    // save. If this line fails the editor is told, and the headline they
    // typed is already stored — the reverse order could leave a rotation
    // referring to a headline that was never written.
    await repos.headlineAlternates.replaceAll(input.headlineAlternates);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFoundError("The profile could not be found.");
    }
    if (error instanceof ConflictError) {
      // Reachable only if the CHECK constraint rejects a write, which would
      // mean something tried to steer the singleton key. Reported safely.
      return conflictError("The profile could not be saved as requested.");
    }
    console.error("[admin] profile save failed", error);
    return failureError();
  }

  // No redirect: this route *is* the profile editor. Revalidating means the
  // server component re-reads the row, so the page cannot show stale values
  // after a save.
  revalidatePath(PROFILE_PATH);

  return success({ savedAt: saved.updatedAt, createdAt: saved.createdAt });
}
