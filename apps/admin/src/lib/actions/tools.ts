"use server";

/**
 * Tool mutation Server Actions.
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
 * Tools are a flat ordered entity: no owned child table and nothing
 * referencing them, so there is no aggregate write and no cascade to reason
 * about. The one real constraint is `UNIQUE` on `name`, which surfaces as a
 * `ConflictError` and is reported with human wording.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  toolCreateSchema,
  toolIdSchema,
  toolUpdateSchema,
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

/** Where every successful tool mutation lands. */
const LIST_PATH = "/tools";

/** Shown when a name collides with the table's UNIQUE constraint. */
const NAME_TAKEN = "That name is already used by another tool.";

/**
 * What a successful tool mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`.
 */
export interface ToolMutationData {
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
 * `ConflictError` messages come from our own error model (e.g. "tool: create
 * violates a uniqueness constraint") and still describe internals, so they
 * are never forwarded. The caller supplies human wording instead.
 */
function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof NotFoundError) {
    return notFoundError("That tool no longer exists.");
  }
  if (error instanceof ConflictError) return conflictError(NAME_TAKEN);
  console.error("[admin] tool mutation failed", error);
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

export async function createToolAction(
  _previous: ActionState<ToolMutationData>,
  formData: FormData,
): Promise<ActionState<ToolMutationData>> {
  await requireAdminIdentity();

  const parsed = toolCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    // Uniqueness of `name` is the database's decision, not something checked
    // then assumed here — a read-then-write check is a race the constraint
    // already wins.
    await repos.tools.create(parsed.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateToolAction(
  _previous: ActionState<ToolMutationData>,
  formData: FormData,
): Promise<ActionState<ToolMutationData>> {
  await requireAdminIdentity();

  const idResult = toolIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing tool identifier."] });
  }

  const parsed = toolUpdateSchema.safeParse(readPayload(formData));
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
    const updated = await repos.tools.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteToolAction(
  _previous: ActionState<ToolMutationData>,
  formData: FormData,
): Promise<ActionState<ToolMutationData>> {
  await requireAdminIdentity();

  const idResult = toolIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing tool identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing in the schema references `tools`, so this removes exactly one
    // row and cascades to nothing.
    const deleted = await repos.tools.delete(idResult.data);
    if (!deleted) return notFoundError("That tool no longer exists.");
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
