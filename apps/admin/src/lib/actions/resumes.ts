"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  resumeCreateSchema,
  resumeIdSchema,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import { getAdminMediaService } from "@/lib/media/composition";
import { StorageUnavailableError } from "@/lib/storage/binding";
import {
  failureError,
  notFoundError,
  success,
  validationError,
  type ActionResult,
  type ActionState,
  type FieldErrors,
} from "./result";

const LIST_PATH = "/resumes";

export interface ResumeMutationData {
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

export async function createResumeAction(
  _prevState: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const labelRaw = formData.get("label");
  const mediaAssetIdRaw = formData.get("mediaAssetId");
  const isCurrentRaw = formData.get("isCurrent");
  const isVisibleRaw = formData.get("isVisible");
  const fileRaw = formData.get("file");

  let mediaAssetId =
    typeof mediaAssetIdRaw === "string" ? mediaAssetIdRaw.trim() : "";

  // If a file is uploaded directly alongside résumé creation
  if (fileRaw instanceof File && fileRaw.size > 0) {
    try {
      const bytes = new Uint8Array(await fileRaw.arrayBuffer());
      const mediaService = await getAdminMediaService();
      const uploadResult = await mediaService.createAsset({
        purpose: "resumes",
        declaredContentType: fileRaw.type || "application/pdf",
        bytes,
      });

      if (!uploadResult.ok) {
        if (uploadResult.reason === "validation") {
          return validationError({ file: [uploadResult.message] });
        }
        return failureError(uploadResult.message);
      }
      mediaAssetId = uploadResult.data.id;
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        return failureError("Storage service unavailable.");
      }
      return failureError("Failed to upload résumé file.");
    }
  }

  const parse = resumeCreateSchema.safeParse({
    label: labelRaw,
    mediaAssetId,
    isCurrent: isCurrentRaw === "true" || isCurrentRaw === "on",
    isVisible: isVisibleRaw !== "false" && isVisibleRaw !== "off",
  });

  if (!parse.success) {
    return validationError(toFieldErrors(parse.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    const created = await repos.resumes.create(parse.data);

    if (parse.data.isCurrent) {
      await repos.resumes.makeCurrent(created.id);
    }

    revalidatePath(LIST_PATH);
  } catch (error) {
    return failureError(
      `Failed to create résumé: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  redirect(`${LIST_PATH}?created=1`);
}

export async function setCurrentResumeAction(
  id: string,
): Promise<ActionResult<ResumeMutationData>> {
  await requireAdminIdentity();

  const idParse = resumeIdSchema.safeParse(id);
  if (!idParse.success) {
    return validationError(toFieldErrors(idParse.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    const updated = await repos.resumes.makeCurrent(idParse.data);
    revalidatePath(LIST_PATH);
    return success({ id: updated.id });
  } catch (error) {
    return failureError(
      `Failed to mark résumé current: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function deleteResumeAction(
  _prevState: ActionState<ResumeMutationData>,
  formData: FormData,
): Promise<ActionState<ResumeMutationData>> {
  await requireAdminIdentity();

  const idRaw = formData.get("id");
  const idParse = resumeIdSchema.safeParse(idRaw);
  if (!idParse.success) {
    return validationError(toFieldErrors(idParse.error.issues));
  }

  try {
    const repos = await getAdminRepositories();
    const deleted = await repos.resumes.delete(idParse.data);
    if (!deleted) {
      return notFoundError("Résumé record not found.");
    }
    revalidatePath(LIST_PATH);
  } catch (error) {
    return failureError(
      `Failed to delete résumé: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  redirect(LIST_PATH);
}
