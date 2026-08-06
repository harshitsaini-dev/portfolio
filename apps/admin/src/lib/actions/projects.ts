"use server";

/**
 * Project mutation Server Actions.
 *
 * Every action follows the same four steps, in this order, without
 * exception:
 *
 *   1. `requireAdminIdentity()` — authorization, independent of any route
 *      protection. A Server Action is a POST endpoint; it is reachable
 *      directly and must never rely on the page that rendered the form
 *      having been protected.
 *   2. Zod validation of the untrusted payload.
 *   3. The repository layer — never raw SQL.
 *   4. Map known persistence errors to safe, typed results.
 *
 * Authorization is never derived from a hidden form field. The identity
 * comes from the verified Access assertion on the request.
 *
 * CSRF: Next.js Server Actions are POST-only with an unguessable action id
 * and Next enforces a same-origin check on the `Origin` header, so a custom
 * token would add nothing. Cloudflare Access sits in front in production as
 * a second barrier. See docs/DECISIONS.md.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ConflictError,
  NotFoundError,
  type Repositories,
} from "@portfolio/database";
import {
  projectCreateSchema,
  projectIdSchema,
  projectUpdateSchema,
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

/** Where every successful project mutation lands. */
const LIST_PATH = "/projects";

/**
 * What a successful project mutation returns.
 *
 * One shape across create/update/delete so a form can be typed against a
 * single `ActionState`. `slug` is absent after a delete.
 */
export interface ProjectMutationData {
  readonly id: string;
  readonly slug?: string;
}

/** Flatten Zod issues into the form's field-name keyspace. */
function toFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    // `links.0.url` → one key per offending field, so the form can place
    // the message next to the right input.
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

/**
 * Turn a repository error into a safe result.
 *
 * `ConflictError` messages come from our own error model (e.g. "project:
 * create violates a uniqueness constraint") and still describe internals,
 * so they are never forwarded. The caller supplies human wording instead.
 */
function toActionResult(error: unknown, conflictMessage: string): ActionResult<never> {
  if (error instanceof NotFoundError) return notFoundError();
  if (error instanceof ConflictError) return conflictError(conflictMessage);
  console.error("[admin] project mutation failed", error);
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

/** Apply relationships. Separated so create and update share one path. */
async function applyRelations(
  repos: Repositories,
  projectId: string,
  input: {
    links?: readonly { label: string; url: string; kind: string }[];
    technologyIds?: readonly string[];
    media?: readonly { mediaAssetId: string; caption: string | null }[];
  },
): Promise<void> {
  if (input.links) {
    await repos.projects.setLinks(
      projectId,
      input.links.map((link, index) => ({
        label: link.label,
        url: link.url,
        kind: link.kind as never,
        position: index,
      })),
    );
  }
  if (input.technologyIds) {
    await repos.projects.setTechnologies(projectId, input.technologyIds);
  }
  if (input.media) {
    await repos.projects.setMedia(
      projectId,
      input.media.map((item, index) => ({
        mediaAssetId: item.mediaAssetId,
        caption: item.caption,
        position: index,
      })),
    );
  }
}

export async function createProjectAction(
  _previous: ActionState<ProjectMutationData>,
  formData: FormData,
): Promise<ActionState<ProjectMutationData>> {
  await requireAdminIdentity();

  const parsed = projectCreateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;

  let created: { id: string; slug: string };
  try {
    const repos = await getAdminRepositories();
    const project = await repos.projects.create({
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      description: input.description,
      status: input.status,
      isFeatured: input.isFeatured,
      position: input.position,
      periodLabel: input.periodLabel,
      startedOn: input.startedOn,
      completedOn: input.completedOn,
    });

    // Relationship writes reference rows that must already exist; a bad id
    // surfaces as a foreign-key ConflictError and is reported as such.
    await applyRelations(repos, project.id, input);
    created = { id: project.id, slug: project.slug };
  } catch (error) {
    return toActionResult(
      error,
      "That slug is already in use, or a selected technology or media item no longer exists.",
    );
  }

  revalidatePath("/projects");
  // Redirect OUTSIDE the try block. `redirect()` signals by throwing, so
  // calling it inside would be caught by the handler above and reported as
  // a failure — a classic Server Action footgun. Redirecting on the server
  // also avoids a client-side navigation race and works without JavaScript.
  redirect(`${LIST_PATH}?created=${encodeURIComponent(created.slug)}`);
}

export async function updateProjectAction(
  _previous: ActionState<ProjectMutationData>,
  formData: FormData,
): Promise<ActionState<ProjectMutationData>> {
  await requireAdminIdentity();

  const idResult = projectIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing project identifier."] });
  }

  const parsed = projectUpdateSchema.safeParse(readPayload(formData));
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
    const project = await repos.projects.update(idResult.data, {
      title: input.title,
      slug: input.slug,
      summary: input.summary,
      description: input.description,
      status: input.status,
      isFeatured: input.isFeatured,
      position: input.position,
      periodLabel: input.periodLabel,
      startedOn: input.startedOn,
      completedOn: input.completedOn,
    });

    await applyRelations(repos, project.id, input);
    updated = { id: project.id, slug: project.slug };
  } catch (error) {
    return toActionResult(
      error,
      "That slug is already in use, or a selected technology or media item no longer exists.",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updated.id}`);
  redirect(`${LIST_PATH}?updated=${encodeURIComponent(updated.slug)}`);
}

export async function deleteProjectAction(
  _previous: ActionState<ProjectMutationData>,
  formData: FormData,
): Promise<ActionState<ProjectMutationData>> {
  await requireAdminIdentity();

  const idResult = projectIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing project identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    // Owned rows (links, media attachments, technology joins) go with it via
    // ON DELETE CASCADE; the media assets themselves survive.
    const deleted = await repos.projects.delete(idResult.data);
    if (!deleted) return notFoundError();
  } catch (error) {
    return toActionResult(
      error,
      "This project could not be deleted because something still references it.",
    );
  }

  revalidatePath(LIST_PATH);
  // Outside the try, for the same reason as create/update: `redirect()`
  // throws to signal, and the handler above would otherwise swallow it and
  // report a spurious failure. Redirecting server-side also stops the user
  // being left on the edit page of a project that no longer exists.
  redirect(LIST_PATH);
}
