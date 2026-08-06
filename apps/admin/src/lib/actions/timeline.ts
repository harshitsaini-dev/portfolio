"use server";

/**
 * Timeline entry mutation Server Actions.
 *
 * The same four steps, in the same order, as the other CMS entities:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * ## Highlights travel with the entry
 *
 * There are no separate highlight actions. A highlight has no meaning apart
 * from the entry that owns it, and the repository writes both in a single
 * batch, so exposing independent child mutations would let a caller
 * half-save an aggregate the repository is built to keep whole.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  timelineEntryCreateSchema,
  timelineEntryIdSchema,
  timelineEntryUpdateSchema,
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

/** Where every successful timeline mutation lands. */
const LIST_PATH = "/timeline";

const SAVE_CONFLICT =
  "This entry could not be saved. Please review the values and try again.";

/**
 * What a successful timeline mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`.
 */
export interface TimelineMutationData {
  readonly id: string;
}

/** Flatten Zod issues into the form's field-name keyspace. */
function toFieldErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    // `highlights.2.content` → one key per offending row, so the form can
    // place the message next to the right bullet.
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
    return notFoundError("That timeline entry no longer exists.");
  }
  if (error instanceof ConflictError) return conflictError(SAVE_CONFLICT);
  console.error("[admin] timeline mutation failed", error);
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

export async function createTimelineEntryAction(
  _previous: ActionState<TimelineMutationData>,
  formData: FormData,
): Promise<ActionState<TimelineMutationData>> {
  await requireAdminIdentity();

  const parsed = timelineEntryCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const { highlights, ...entry } = parsed.data;

  try {
    const repos = await getAdminRepositories();
    // One aggregate write: the entry and its highlights commit together, so
    // a failing bullet cannot leave a half-saved entry behind.
    await repos.timeline.createWithHighlights(
      entry,
      highlights.map((highlight) => highlight.content),
    );
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateTimelineEntryAction(
  _previous: ActionState<TimelineMutationData>,
  formData: FormData,
): Promise<ActionState<TimelineMutationData>> {
  await requireAdminIdentity();

  const idResult = timelineEntryIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing timeline entry identifier."] });
  }

  const parsed = timelineEntryUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const { highlights, ...patch } = parsed.data;

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // `id`, `createdAt`, and `updatedAt` are absent from the schema and from
    // the repository's patch allowlist, so there is no path by which this
    // call could rewrite them.
    const updated = await repos.timeline.updateWithHighlights(
      idResult.data,
      patch,
      (highlights ?? []).map((highlight) => highlight.content),
    );
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteTimelineEntryAction(
  _previous: ActionState<TimelineMutationData>,
  formData: FormData,
): Promise<ActionState<TimelineMutationData>> {
  await requireAdminIdentity();

  const idResult = timelineEntryIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing timeline entry identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Owned highlights go with it via ON DELETE CASCADE; unrelated entries
    // are untouched.
    const deleted = await repos.timeline.delete(idResult.data);
    if (!deleted) return notFoundError("That timeline entry no longer exists.");
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
