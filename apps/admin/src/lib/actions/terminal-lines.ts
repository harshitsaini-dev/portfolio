"use server";

/**
 * Terminal line mutation Server Actions.
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
 * The simplest entity in the CMS: no owned child table, nothing referencing
 * it, and **no unique constraint** — two lines may legitimately read the same,
 * and an editor writing the same joke twice is their business. So there is no
 * conflict case to report, unlike tools or technologies.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NotFoundError } from "@portfolio/database";
import {
  terminalLineCreateSchema,
  terminalLineIdSchema,
  terminalLineUpdateSchema,
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
const LIST_PATH = "/terminal-lines";

const GONE = "That line no longer exists.";

export interface TerminalLineMutationData {
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
  console.error("[admin] terminal line mutation failed", error);
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

export async function createTerminalLineAction(
  _previous: ActionState<TerminalLineMutationData>,
  formData: FormData,
): Promise<ActionState<TerminalLineMutationData>> {
  await requireAdminIdentity();

  const parsed = terminalLineCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    await repos.terminalLines.create(parsed.data);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught above and reported as a failure.
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateTerminalLineAction(
  _previous: ActionState<TerminalLineMutationData>,
  formData: FormData,
): Promise<ActionState<TerminalLineMutationData>> {
  await requireAdminIdentity();

  const idResult = terminalLineIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing line identifier."] });
  }

  const parsed = terminalLineUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    // Fields absent from the patch stay absent all the way down, so editing
    // the text never rewrites position or visibility.
    const updated = await repos.terminalLines.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteTerminalLineAction(
  _previous: ActionState<TerminalLineMutationData>,
  formData: FormData,
): Promise<ActionState<TerminalLineMutationData>> {
  await requireAdminIdentity();

  const idResult = terminalLineIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing line identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Nothing references `terminal_lines`, so this removes exactly one row and
    // cascades to nothing.
    const deleted = await repos.terminalLines.delete(idResult.data);
    if (!deleted) return notFoundError(GONE);
  } catch (error) {
    return toActionResult(error);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
