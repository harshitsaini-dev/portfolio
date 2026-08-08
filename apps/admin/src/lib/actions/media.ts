"use server";

/**
 * Media asset mutation Server Actions.
 *
 * Enforces the mandatory 4-step order for every CMS action:
 *
 *   1. `requireAdminIdentity()` — authorization FIRST, before reading a byte of payload
 *      or resolving any binding.
 *   2. Zod validation of the untrusted payload.
 *   3. Coordinate with the media service / repositories — never raw SQL or direct bucket calls.
 *   4. Map persistence/storage results to safe, typed ActionResults.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NotFoundError } from "@portfolio/database";
import {
  mediaAssetIdSchema,
  mediaAssetUpdateSchema,
  type StorageNamespace,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import { getAdminMediaService } from "@/lib/media/composition";
import { StorageUnavailableError } from "@/lib/storage/binding";

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

function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function uploadMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  // 1. Authorization FIRST
  await requireAdminIdentity();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return validationError({ file: ["Please select a non-empty file to upload."] });
  }

  const rawPurpose = formData.get("purpose");
  const purpose: StorageNamespace =
    rawPurpose === "resumes" ? "resumes" : "media";

  const rawAltText = formData.get("altText");
  const altText = typeof rawAltText === "string" ? rawAltText : null;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return validationError({ file: ["Failed to read uploaded file bytes."] });
  }

  try {
    const mediaService = await getAdminMediaService();
    const result = await mediaService.createAsset({
      purpose,
      declaredContentType: file.type || "application/octet-stream",
      bytes,
      altText,
    });

    if (!result.ok) {
      if (result.reason === "validation") {
        return validationError({ form: [result.message] });
      }
      if (result.reason === "in_use") {
        return conflictError(result.message);
      }
      return failureError(result.message);
    }
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return failureError(
        "Object storage is currently unavailable. No R2 bucket is configured.",
      );
    }
    console.error("[admin] uploadMediaAssetAction failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?created=1`);
}

export async function updateMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  await requireAdminIdentity();

  const idResult = mediaAssetIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing media asset identifier."] });
  }

  const parsed = mediaAssetUpdateSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }

  let updatedId: string;
  try {
    const repos = await getAdminRepositories();
    const updated = await repos.media.update(idResult.data, parsed.data);
    updatedId = updated.id;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFoundError("That media asset no longer exists.");
    }
    console.error("[admin] updateMediaAssetAction failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${updatedId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteMediaAssetAction(
  _previous: ActionState<MediaMutationData>,
  formData: FormData,
): Promise<ActionState<MediaMutationData>> {
  await requireAdminIdentity();

  const idResult = mediaAssetIdSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    return validationError({ form: ["Missing media asset identifier."] });
  }

  try {
    const mediaService = await getAdminMediaService();
    const result = await mediaService.deleteAsset(idResult.data);

    if (!result.ok) {
      if (result.reason === "not_found") {
        return notFoundError(result.message);
      }
      if (result.reason === "in_use") {
        return conflictError(result.message);
      }
      return failureError(result.message);
    }
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return failureError(
        "Object storage is currently unavailable. Cannot delete asset without storage.",
      );
    }
    console.error("[admin] deleteMediaAssetAction failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
