"use server";

/**
 * Page section mutation Server Actions.
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
 * Sections are a flat ordered entity: no owned child table, nothing
 * referencing them, and no foreign key in either direction, so there is no
 * aggregate write and no cascade to reason about.
 *
 * ## The one constraint, and the one thing that cannot be updated
 *
 * `sections.key` is `NOT NULL UNIQUE`, so a duplicate key on **create**
 * surfaces as a `ConflictError` and is reported with human wording.
 *
 * There is no corresponding *update* conflict path, because `key` is not
 * updatable at all: it is the stable identifier the public UI maps to a
 * component, the repository omits it from its patch allowlist, and
 * `sectionUpdateSchema` rejects it outright. An update carrying `key`
 * therefore fails validation rather than silently doing nothing.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  sectionCreateSchema,
  sectionIdSchema,
  sectionUpdateSchema,
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

/** Where every successful section mutation lands. */
const LIST_PATH = "/sections";

/** Shown when a key collides with the table's UNIQUE constraint. */
const KEY_TAKEN = "That key is already used by another section.";

/**
 * What a successful section mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`.
 */
export interface SectionMutationData {
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
 * `ConflictError` messages come from our own error model (e.g. "section:
 * create violates a uniqueness constraint") and still describe internals, so
 * they are never forwarded.
 */
function toActionResult(error: unknown, conflictMessage: string): ActionResult<never> {
  if (error instanceof NotFoundError) {
    return notFoundError("That section no longer exists.");
  }
  if (error instanceof ConflictError) return conflictError(conflictMessage);
  console.error("[admin] section mutation failed", error);
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

export async function createSectionAction(
  _previous: ActionState<SectionMutationData>,
  formData: FormData,
): Promise<ActionState<SectionMutationData>> {
  await requireAdminIdentity();

  const parsed = sectionCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    // Uniqueness of `key` is the database's decision, not something checked
    // then assumed here — a read-then-write check is a race the constraint
    // already wins.
    await repos.sections.create(parsed.data);
  } catch (error) {
    return toActionResult(error, KEY_TAKEN);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateSectionAction(
  _previous: ActionState<SectionMutationData>,
  formData: FormData,
): Promise<ActionState<SectionMutationData>> {
  await requireAdminIdentity();

  const idResult = sectionIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing section identifier."] });
  }

  const parsed = sectionUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // `key`, `id`, `createdAt`, and `updatedAt` are all absent from the
    // update schema and from the repository's patch allowlist, so there is
    // no path by which this call could rewrite them. Fields absent from the
    // patch stay absent all the way down.
    const updated = await repos.sections.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    // A key collision cannot arise here — `key` is not updatable — so the
    // generic wording is the honest one for any residual constraint error.
    return toActionResult(
      error,
      "This section could not be saved. Please review the values and try again.",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteSectionAction(
  _previous: ActionState<SectionMutationData>,
  formData: FormData,
): Promise<ActionState<SectionMutationData>> {
  await requireAdminIdentity();

  const idResult = sectionIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing section identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing in the schema references `sections`, so this removes exactly
    // one row and cascades to nothing.
    const deleted = await repos.sections.delete(idResult.data);
    if (!deleted) return notFoundError("That section no longer exists.");
  } catch (error) {
    return toActionResult(error, KEY_TAKEN);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
