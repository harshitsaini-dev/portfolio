"use server";

/**
 * Social link mutation Server Actions.
 *
 * The same four steps, in the same order, as every other CMS entity:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * Social links are a flat ordered entity: no owned child table, nothing
 * referencing them, and **no UNIQUE constraint on any column**, so there is
 * no aggregate write, no cascade, and no expected conflict path. A
 * `ConflictError` is still handled — a CHECK violation would arrive that way
 * — but it is not a case the UI invites.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  socialLinkCreateSchema,
  socialLinkIdSchema,
  socialLinkUpdateSchema,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  conflictError,
  failureError,
  notFoundError,
  validationError,
  type ActionResult,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

/** Where every successful social link mutation lands. */
const LIST_PATH = "/socials";

const SAVE_CONFLICT =
  "This social link could not be saved. Please review the values and try again.";

/**
 * What a successful social link mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`.
 */
export interface SocialLinkMutationData {
  readonly id: string;
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

/**
 * Turn a repository error into a safe result.
 *
 * `ConflictError` messages come from our own error model and still describe
 * internals, so they are never forwarded.
 */
function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof NotFoundError) {
    return notFoundError("That social link no longer exists.");
  }
  if (error instanceof ConflictError) return conflictError(SAVE_CONFLICT);
  console.error("[admin] social link mutation failed", error);
  return failureError();
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

export async function createSocialLinkAction(
  _previous: ActionState<SocialLinkMutationData>,
  formData: FormData,
): Promise<ActionState<SocialLinkMutationData>> {
  await requireAdminIdentity();

  const parsed = socialLinkCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    await repos.socialLinks.create(parsed.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateSocialLinkAction(
  _previous: ActionState<SocialLinkMutationData>,
  formData: FormData,
): Promise<ActionState<SocialLinkMutationData>> {
  await requireAdminIdentity();

  const idResult = socialLinkIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing social link identifier."] });
  }

  const parsed = socialLinkUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // `id`, `createdAt`, and `updatedAt` are absent from the schema and from
    // the repository's patch allowlist, so there is no path by which this
    // call could rewrite them. Fields absent from the patch stay absent all
    // the way down, so an unmentioned column is never rewritten.
    const updated = await repos.socialLinks.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteSocialLinkAction(
  _previous: ActionState<SocialLinkMutationData>,
  formData: FormData,
): Promise<ActionState<SocialLinkMutationData>> {
  await requireAdminIdentity();

  const idResult = socialLinkIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing social link identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing in the schema references `social_links`, so this removes
    // exactly one row and cascades to nothing.
    const deleted = await repos.socialLinks.delete(idResult.data);
    if (!deleted) return notFoundError("That social link no longer exists.");
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
