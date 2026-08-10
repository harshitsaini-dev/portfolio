"use server";

/**
 * Note mutation Server Actions.
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
 * The one thing notes add over the simpler entities: a **unique slug**, which
 * is a URL. Two notes cannot share one, and the database is what enforces it —
 * a "does this exist" query before the insert would still lose a race between
 * two admins saving at once. So the conflict is caught, not prevented, and
 * reported against the field the editor can actually fix.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  noteCreateSchema,
  noteIdSchema,
  noteUpdateSchema,
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

/** Where every successful mutation lands. */
const LIST_PATH = "/notes";

const GONE = "That note no longer exists.";

export interface NoteMutationData {
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
 * Repository messages describe internals ("terminal line: update ...") and are
 * never forwarded; the wording here is ours.
 */
function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof NotFoundError) return notFoundError(GONE);
  if (error instanceof ConflictError) {
    return conflictError("Another note already uses that URL.");
  }
  console.error("[admin] note mutation failed", error);
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

export async function createNoteAction(
  _previous: ActionState<NoteMutationData>,
  formData: FormData,
): Promise<ActionState<NoteMutationData>> {
  await requireAdminIdentity();

  const parsed = noteCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    await repos.notes.create(parsed.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught above and reported as a failure.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateNoteAction(
  _previous: ActionState<NoteMutationData>,
  formData: FormData,
): Promise<ActionState<NoteMutationData>> {
  await requireAdminIdentity();

  const idResult = noteIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing note identifier."] });
  }

  const parsed = noteUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // Fields absent from the patch stay absent all the way down, so editing
    // the text never rewrites position or visibility.
    const updated = await repos.notes.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteNoteAction(
  _previous: ActionState<NoteMutationData>,
  formData: FormData,
): Promise<ActionState<NoteMutationData>> {
  await requireAdminIdentity();

  const idResult = noteIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing note identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing references `notes`. Its own reference to a media asset is the
    // other direction, and is `ON DELETE SET NULL` — deleting a note never
    // touches the image it used.
    const deleted = await repos.notes.delete(idResult.data);
    if (!deleted) return notFoundError(GONE);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
