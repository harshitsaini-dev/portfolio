"use server";

/**
 * API key Server Actions: create, revoke, delete.
 *
 * Same four steps as every other action module — guard, validate, repository,
 * safe result — with one difference in create: it returns instead of
 * redirecting, because its result carries the key itself, and this response
 * is the only time that value ever exists outside the caller's own storage.
 * A redirect would drop it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiKeyCreateSchema, apiKeyIdSchema } from "@portfolio/schemas";

import { mintApiKey } from "@/lib/api/keys";
import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  failureError,
  notFoundError,
  success,
  validationError,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

const LIST_PATH = "/api-keys";

export interface CreatedApiKey {
  /** The full key. Shown once; never stored. */
  readonly key: string;
  readonly name: string;
}

export interface ApiKeyMutationData {
  readonly id: string;
}

function toFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

export async function createApiKeyAction(
  _previous: ActionState<CreatedApiKey>,
  formData: FormData,
): Promise<ActionState<CreatedApiKey>> {
  await requireAdminIdentity();

  const rawExpiry = formData.get("expiresInDays");
  const parsed = apiKeyCreateSchema.safeParse({
    name: formData.get("name"),
    scopes: formData.getAll("scopes"),
    expiresInDays:
      typeof rawExpiry === "string" && rawExpiry !== "" ? Number(rawExpiry) : null,
  });
  if (!parsed.success) return validationError(toFieldErrors(parsed.error.issues));
  const input = parsed.data;

  try {
    const repos = await getAdminRepositories();
    const minted = await mintApiKey();
    await repos.apiKeys.create({
      name: input.name,
      prefix: minted.prefix,
      tokenHash: minted.tokenHash,
      scopes: input.scopes,
      expiresAt:
        input.expiresInDays === null
          ? null
          : new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString(),
    });
    revalidatePath(LIST_PATH);
    return success({ key: minted.key, name: input.name });
  } catch (error) {
    console.error("[admin] api key creation failed", error);
    return failureError();
  }
}

async function mutate(
  formData: FormData,
  operation: "revoke" | "delete",
): Promise<ActionState<ApiKeyMutationData>> {
  const id = apiKeyIdSchema.safeParse(formData.get("id"));
  if (!id.success) return validationError({ form: ["Missing key identifier."] });

  try {
    const repos = await getAdminRepositories();
    const changed =
      operation === "revoke"
        ? await repos.apiKeys.revoke(id.data)
        : await repos.apiKeys.delete(id.data);
    if (!changed) return notFoundError("That key no longer exists.");
  } catch (error) {
    console.error(`[admin] api key ${operation} failed`, error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?${operation === "revoke" ? "revoked" : "deleted"}=1`);
}

export async function revokeApiKeyAction(
  _previous: ActionState<ApiKeyMutationData>,
  formData: FormData,
): Promise<ActionState<ApiKeyMutationData>> {
  await requireAdminIdentity();
  return mutate(formData, "revoke");
}

export async function deleteApiKeyAction(
  _previous: ActionState<ApiKeyMutationData>,
  formData: FormData,
): Promise<ActionState<ApiKeyMutationData>> {
  await requireAdminIdentity();
  return mutate(formData, "delete");
}
