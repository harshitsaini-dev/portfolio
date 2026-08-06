"use server";

/**
 * Technology mutation Server Actions.
 *
 * Deliberately the same four steps, in the same order, as
 * `./projects.ts` — this is the Phase 7 pattern being reused, not a new one:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * Authorization is never derived from a hidden form field. The identity
 * comes from the verified Access assertion on the request.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  technologyCreateSchema,
  technologyIdSchema,
  technologyUpdateSchema,
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

/** Where every successful technology mutation lands. */
const LIST_PATH = "/technologies";

/** Shown when a slug collides with the table's UNIQUE constraint. */
const SLUG_TAKEN = "That slug is already used by another technology.";

/**
 * What a successful technology mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`. `slug` is absent after a delete.
 */
export interface TechnologyMutationData {
  readonly id: string;
  readonly slug?: string;
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
 * `ConflictError` messages come from our own error model (e.g. "technology:
 * create violates a uniqueness constraint") and still describe internals, so
 * they are never forwarded. The caller supplies human wording instead.
 */
function toActionResult(
  error: unknown,
  conflictMessage: string,
): ActionResult<never> {
  if (error instanceof NotFoundError) {
    return notFoundError("That technology no longer exists.");
  }
  if (error instanceof ConflictError) return conflictError(conflictMessage);
  console.error("[admin] technology mutation failed", error);
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

export async function createTechnologyAction(
  _previous: ActionState<TechnologyMutationData>,
  formData: FormData,
): Promise<ActionState<TechnologyMutationData>> {
  await requireAdminIdentity();

  const parsed = technologyCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;

  let created: { id: string; slug: string };
  try {
    const repos = await getAdminRepositories();
    const technology = await repos.technologies.create({
      name: input.name,
      slug: input.slug,
      category: input.category,
    });
    created = { id: technology.id, slug: technology.slug };
  } catch (error) {
    return toActionResult(error, SLUG_TAKEN);
  }

  revalidatePath(LIST_PATH);
  // Projects render the technology picker from this table, so its pages go
  // stale the moment a technology is added or renamed.
  revalidatePath("/projects");
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${LIST_PATH}?created=${encodeURIComponent(created.slug)}`);
}

export async function updateTechnologyAction(
  _previous: ActionState<TechnologyMutationData>,
  formData: FormData,
): Promise<ActionState<TechnologyMutationData>> {
  await requireAdminIdentity();

  const idResult = technologyIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing technology identifier."] });
  }

  const parsed = technologyUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;

  let updated: { id: string; slug: string };
  try {
    const repos = await getAdminRepositories();
    // `id`, `createdAt`, and `updatedAt` are absent from the schema and from
    // the repository's patch allowlist, so there is no path by which this
    // call could rewrite them.
    const technology = await repos.technologies.update(idResult.data, {
      name: input.name,
      slug: input.slug,
      category: input.category,
    });
    updated = { id: technology.id, slug: technology.slug };
  } catch (error) {
    return toActionResult(error, SLUG_TAKEN);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updated.id}`);
  revalidatePath("/projects");
  redirect(`${LIST_PATH}?updated=${encodeURIComponent(updated.slug)}`);
}

export async function deleteTechnologyAction(
  _previous: ActionState<TechnologyMutationData>,
  formData: FormData,
): Promise<ActionState<TechnologyMutationData>> {
  await requireAdminIdentity();

  const idResult = technologyIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing technology identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // `project_technologies.technology_id` is ON DELETE RESTRICT, so a
    // technology still tagged on a project cannot be deleted. That arrives
    // here as a foreign-key `ConflictError` and is reported as a conflict —
    // the projects themselves are never touched.
    const deleted = await repos.technologies.delete(idResult.data);
    if (!deleted) return notFoundError("That technology no longer exists.");
  } catch (error) {
    return toActionResult(
      error,
      "This technology is still used by one or more projects. Remove it from them first.",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath("/projects");
  redirect(LIST_PATH);
}
