"use server";

/**
 * Media asset Server Actions.
 *
 * The same four steps, in the same order, as every other action module in
 * this app — with one addition that matters more here than anywhere else:
 *
 *   1. `requireAdminIdentity()` — authorization FIRST, before a single byte
 *      of the upload is read and before any binding is resolved. A Server
 *      Action is a POST endpoint; it is reachable directly. An upload handler
 *      that parses a multipart body before authorizing has already spent
 *      exactly the work an unauthenticated caller wanted it to spend.
 *   2. Validation of the untrusted payload — and for uploads that means the
 *      bytes, not just the envelope.
 *   3. The media service, which owns all R2/D1 orchestration. This module
 *      never touches storage or the media repository directly, so the
 *      ordering and compensation rules live in exactly one place.
 *   4. Map known failures to safe, typed results.
 *
 * The service returns a discriminated result rather than throwing, so the
 * mapping here is a translation, not error handling.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MAX_UPLOAD_BYTES,
  mediaAssetIdSchema,
  mediaAssetUpdateSchema,
  mediaPurposeSchema,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import { getAdminMediaService } from "@/lib/media/composition";
import {
  conflictError,
  failureError,
  notFoundError,
  validationError,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

const LIST_PATH = "/media";

export interface MediaMutationData {
  readonly id: string;
}

/**
 * Translate a service failure into an action result.
 *
 * `in_use` becomes a conflict because the editor must act elsewhere first;
 * everything infrastructural becomes a generic failure. The service's message
 * is already safe to display — it names the file, never the bucket, the key,
 * or the database — so it is forwarded rather than replaced.
 */
function toActionResult(
  reason: string,
  message: string,
): ActionState<MediaMutationData> {
  switch (reason) {
    case "validation":
      return validationError({ file: [message] });
    case "not_found":
      return notFoundError(message);
    case "in_use":
      return conflictError(message);
    default:
      // storage_failure / persistence_failure / key_unavailable. The
      // distinction matters to the server log, not to the editor.
      return failureError(message);
  }
}

/** Read the uploaded file without trusting anything the browser said about it. */
function readUpload(formData: FormData): File | null {
  const value = formData.get("file");
  return value instanceof File && value.size > 0 ? value : null;
}

export async function uploadMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  // Authorization before the body is touched.
  await requireAdminIdentity();

  const purpose = mediaPurposeSchema.safeParse(formData.get("purpose") ?? "media");
  if (!purpose.success) {
    return validationError({ form: ["Unknown upload purpose."] });
  }

  const file = readUpload(formData);
  if (!file) {
    return validationError({ file: ["Choose a file to upload."] });
  }

  // Refuse an oversized upload from its declared size before reading it into
  // memory. The real byte length is checked again by the policy; this only
  // avoids buffering something that cannot possibly be accepted.
  if (file.size > MAX_UPLOAD_BYTES) {
    return validationError({ file: ["That file is too large."] });
  }

  const altTextRaw = formData.get("altText");
  const altText = typeof altTextRaw === "string" ? altTextRaw : null;

  let created: { id: string };
  try {
    const service = await getAdminMediaService();
    const result = await service.createAsset({
      purpose: purpose.data,
      declaredContentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      altText,
    });
    if (!result.ok) return toActionResult(result.reason, result.message);
    created = { id: result.data.id };
  } catch (error) {
    // The seams fail closed, so this is reachable when no bucket is
    // configured. The reason belongs in the server log, never in the reply.
    console.error("[admin] media upload failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try block: `redirect()` signals by throwing, so
  // calling it inside would be caught above and reported as a failure.
  redirect(`${LIST_PATH}/${encodeURIComponent(created.id)}?uploaded=1`);
}

export async function updateMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  await requireAdminIdentity();

  const idResult = mediaAssetIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing file identifier."] });
  }

  const parsed = mediaAssetUpdateSchema.safeParse({
    altText: formData.get("altText"),
  });
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
      (errors[key] ??= []).push(issue.message);
    }
    return validationError(errors);
  }

  try {
    const repos = await getAdminRepositories();
    const existing = await repos.media.getById(idResult.data);
    if (!existing) return notFoundError("That file no longer exists.");

    // The alt-text rule the migration states but the nullable column cannot
    // enforce: an image must keep a description. Clearing it on a PDF is fine.
    const nextAltText = parsed.data.altText ?? null;
    if (existing.contentType.startsWith("image/") && nextAltText === null) {
      return validationError({
        altText: [
          "Images need alt text describing them for people using a screen reader.",
        ],
      });
    }

    await repos.media.update(idResult.data, { altText: nextAltText });
  } catch (error) {
    console.error("[admin] media update failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${idResult.data}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  await requireAdminIdentity();

  const idResult = mediaAssetIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing file identifier."] });
  }

  try {
    const service = await getAdminMediaService();
    const result = await service.deleteAsset(idResult.data);
    if (!result.ok) return toActionResult(result.reason, result.message);
    // `objectRemoved: false` means the metadata is gone but the object
    // survived a failed storage delete. The editor's intent succeeded, so
    // this is not an error — the orphan is already reported to the server log
    // by the service's diagnostic sink.
  } catch (error) {
    console.error("[admin] media delete failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?deleted=1`);
}
