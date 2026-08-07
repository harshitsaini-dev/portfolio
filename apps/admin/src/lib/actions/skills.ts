"use server";

/**
 * Skill category and skill mutation Server Actions.
 *
 * Six mutations across two entities, each following the same four steps, in
 * the same order, as every other CMS entity:
 *
 *   1. `requireAdminIdentity()` — authorization first, independent of any
 *      route protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * ## The two conflicts this area actually has
 *
 * Both are real database constraints, surfaced rather than pre-empted:
 *
 *   * `skill_categories.slug` is `UNIQUE`.
 *   * `skills` is `UNIQUE (category_id, name)`.
 *   * `skills.category_id` is `REFERENCES skill_categories(id) ON DELETE
 *     RESTRICT`, so deleting a category that still holds skills fails, and
 *     creating a skill under a category that does not exist fails.
 *
 * The repository translates each into a `ConflictError`; this module turns
 * that into human wording. **No child skill is ever deleted to make a
 * category deletion succeed** — the constraint exists precisely to stop that.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ConflictError, NotFoundError } from "@portfolio/database";
import {
  skillCategoryCreateSchema,
  skillCategoryIdSchema,
  skillCategoryUpdateSchema,
  skillCreateSchema,
  skillIdSchema,
  skillUpdateSchema,
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

/** Where every successful skills mutation lands. */
const LIST_PATH = "/skills";
const CATEGORIES_PATH = "/skills/categories";

const CATEGORY_SLUG_TAKEN =
  "That slug is already used by another skill category.";

/**
 * Shown when a category cannot be deleted because skills still reference it.
 *
 * `ON DELETE RESTRICT` is the authority. This wording tells the editor what
 * to change rather than reporting a constraint name.
 *
 * It names **only operations this CMS supports**. An earlier draft said
 * "Move or delete them first", which advertised moving a skill to another
 * category — something the CMS cannot do: `categoryId` is absent from
 * `SkillUpdate` and from the repository's patch allowlist, and the update
 * schema rejects it outright. Guidance the editor cannot act on is worse
 * than no guidance, because it sends them looking for a control that does
 * not exist.
 */
const CATEGORY_IN_USE =
  "This category still contains skills. Delete those skills before deleting this category.";

/**
 * Covers both skill conflicts, because the editor's next step is the same
 * either way: check the name and the category.
 */
const SKILL_CONFLICT =
  "That skill could not be saved. A skill with this name may already exist in the chosen category, or the category may no longer exist.";

export interface SkillsMutationData {
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
 * `ConflictError` messages come from our own error model (e.g. "skill: create
 * violates a foreign key constraint") and still describe internals, so they
 * are never forwarded. The caller supplies human wording instead.
 */
function toActionResult(
  error: unknown,
  notFoundMessage: string,
  conflictMessage: string,
): ActionResult<never> {
  if (error instanceof NotFoundError) return notFoundError(notFoundMessage);
  if (error instanceof ConflictError) return conflictError(conflictMessage);
  console.error("[admin] skills mutation failed", error);
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

const CATEGORY_MISSING = "That skill category no longer exists.";
const SKILL_MISSING = "That skill no longer exists.";

// ---------------------------------------------------------------------------
// Skill categories
// ---------------------------------------------------------------------------

export async function createSkillCategoryAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const parsed = skillCategoryCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    await repos.skills.create(parsed.data);
  } catch (error) {
    return toActionResult(error, CATEGORY_MISSING, CATEGORY_SLUG_TAKEN);
  }

  revalidatePath(CATEGORIES_PATH);
  // The skills list groups by category and the skill form's category picker
  // reads this table, so both go stale when a category is added or renamed.
  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as a
  // failure. Redirecting on the server also works without JavaScript.
  redirect(`${CATEGORIES_PATH}?created=1`);
}

export async function updateSkillCategoryAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const idResult = skillCategoryIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing skill category identifier."] });
  }

  const parsed = skillCategoryUpdateSchema.safeParse(readPayload(formData));
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
    const updated = await repos.skills.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error, CATEGORY_MISSING, CATEGORY_SLUG_TAKEN);
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(`${CATEGORIES_PATH}/${updatedId}`);
  revalidatePath(LIST_PATH);
  redirect(`${CATEGORIES_PATH}?updated=1`);
}

export async function deleteSkillCategoryAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const idResult = skillCategoryIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing skill category identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // `skills.category_id` is ON DELETE RESTRICT, so a category that still
    // holds skills cannot be deleted. That arrives here as a foreign-key
    // `ConflictError` and is reported as a conflict — the skills themselves
    // are never touched, and nothing is cascaded on their behalf.
    const deleted = await repos.skills.delete(idResult.data);
    if (!deleted) return notFoundError(CATEGORY_MISSING);
  } catch (error) {
    return toActionResult(error, CATEGORY_MISSING, CATEGORY_IN_USE);
  }

  revalidatePath(CATEGORIES_PATH);
  revalidatePath(LIST_PATH);
  redirect(CATEGORIES_PATH);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function createSkillAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const parsed = skillCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    // Only the validated foreign key is persisted. Whether that category
    // exists is the FK's decision, not something checked-then-assumed here —
    // a read-then-write check would be a race the constraint already wins.
    await repos.skills.createSkill(parsed.data);
  } catch (error) {
    return toActionResult(error, SKILL_MISSING, SKILL_CONFLICT);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateSkillAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const idResult = skillIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing skill identifier."] });
  }

  const parsed = skillUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // `categoryId` is absent from the update schema by design — moving a
    // skill between categories is a distinct operation, not a field edit.
    const updated = await repos.skills.updateSkill(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error, SKILL_MISSING, SKILL_CONFLICT);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteSkillAction(
  _previous: ActionState<SkillsMutationData>,
  formData: FormData,
): Promise<ActionState<SkillsMutationData>> {
  await requireAdminIdentity();

  const idResult = skillIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing skill identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing references `skills`, so this removes exactly one row and
    // cascades to nothing. The owning category is untouched.
    const deleted = await repos.skills.deleteSkill(idResult.data);
    if (!deleted) return notFoundError(SKILL_MISSING);
  } catch (error) {
    return toActionResult(error, SKILL_MISSING, SKILL_CONFLICT);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
