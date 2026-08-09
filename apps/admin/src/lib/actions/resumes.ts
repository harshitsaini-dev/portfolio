"use server";

/**
 * Résumé mutation Server Actions.
 *
 * The same four steps, in the same order, as every other CMS entity:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form having
 *      been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * ## Four actions rather than three
 *
 * "Make current" is its own action because it is its own operation. At most
 * one résumé may be current, enforced by a partial unique index; setting the
 * flag through a normal update trips that index whenever another row holds it.
 * `repos.resumes.makeCurrent()` clears the others in the same batch, and
 * `isCurrent` is absent from the update schema entirely — so there is no path
 * by which a form could reach the unsafe route.
 *
 * ## What `RESTRICT` means here
 *
 * `resumes.media_asset_id` is `ON DELETE RESTRICT`, so deleting a *media
 * asset* that a résumé points at is blocked by the database. Deleting the
 * *résumé* is unaffected — it leaves the PDF in the library, which is the
 * right default: the file may be wanted again, and nothing else references it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NotFoundError } from "@portfolio/database";
import {
  resumeCreateSchema,
  resumeIdSchema,
  resumeUpdateSchema,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  failureError,
  notFoundError,
  validationError,
  type ActionResult,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

/** Where every successful mutation lands. */
const LIST_PATH = "/resumes";

const GONE = "That résumé no longer exists.";

export interface ResumeMutationData {
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
 * Repository messages describe internals ("resume: create violates …") and are
 * never forwarded; the wording here is ours.
 */
function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof NotFoundError) return notFoundError(GONE);
  console.error("[admin] resume mutation failed", error);
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

export async function createResumeAction(
  _previous: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const parsed = resumeCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    // Never current on creation, whatever else is true. Publishing a résumé
    // is a separate, deliberate act — see `makeResumeCurrentAction`.
    await repos.resumes.create(parsed.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught above and reported as a failure.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateResumeAction(
  _previous: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const idResult = resumeIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing résumé identifier."] });
  }

  const parsed = resumeUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // `isCurrent` is not in the schema and not in the repository's patch
    // allowlist, so this call cannot touch it — editing a label can never
    // publish or unpublish a résumé by accident.
    const updated = await repos.resumes.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

/**
 * Publish one résumé, unpublishing whichever was current.
 *
 * The repository does both halves in a single batch. Doing it as two updates
 * from here would leave a window in which two rows claim `is_current`, which
 * the partial unique index would reject — correctly, but as an opaque
 * constraint failure rather than as a considered operation.
 */
export async function makeResumeCurrentAction(
  _previous: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const idResult = resumeIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing résumé identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    await repos.resumes.makeCurrent(idResult.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?published=1`);
}

export async function deleteResumeAction(
  _previous: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const idResult = resumeIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing résumé identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Removes the résumé record only. The PDF stays in the media library —
    // `media_asset_id` is `ON DELETE RESTRICT` in the other direction, and
    // silently deleting a file because one record referenced it would be a
    // surprise, not a convenience.
    const deleted = await repos.resumes.delete(idResult.data);
    if (!deleted) return notFoundError(GONE);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
