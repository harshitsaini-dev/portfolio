"use server";

/**
 * Site settings mutation Server Action.
 *
 * The same four steps as every other action module: authorization first,
 * validation of the untrusted payload, the repository layer, then a safe
 * mapping of known persistence errors.
 *
 * ## One action, because the row's identity is fixed
 *
 * `site_settings` is singleton-key, pinned to `'singleton'` by a CHECK
 * constraint, and `SiteSettingsRepository.upsert()` is the only write. There
 * is no id parameter and none in the schema, so a caller cannot choose which
 * settings it edits or create a second row.
 *
 * ## It revalidates the public site, not just the admin
 *
 * This is the only action in the CMS whose effect is *global*. Every other
 * mutation changes one record's page; a theme change repaints the whole
 * public site — every route, including project pages. So the revalidation is
 * layout-wide rather than a single path, and the reason is worth naming: an
 * editor who changes the accent and sees the old one on the public site
 * would reasonably conclude the setting does not work.
 */

import { revalidatePath } from "next/cache";

import { ConflictError, NotFoundError } from "@portfolio/database";
import { siteSettingsSaveSchema } from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  conflictError,
  failureError,
  notFoundError,
  success,
  validationError,
  type ActionState,
  type FieldErrors,
} from "./result.ts";

const SETTINGS_PATH = "/settings";

export interface SettingsMutationData {
  readonly savedAt: string;
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

export async function saveSettingsAction(
  _previous: ActionState<SettingsMutationData>,
  formData: FormData,
): Promise<ActionState<SettingsMutationData>> {
  await requireAdminIdentity();

  const parsed = siteSettingsSaveSchema.safeParse(readPayload(formData));
  if (!parsed.success) {
    return validationError(toFieldErrors(parsed.error.issues));
  }
  const input = parsed.data;

  let saved;
  try {
    const repos = await getAdminRepositories();
    saved = await repos.siteSettings.upsert({
      siteName: input.siteName,
      siteDescription: input.siteDescription,
      defaultTheme: input.defaultTheme,
      accentColor: input.accentColor,
      socialImageId: input.socialImageId,
      faviconMediaId: input.faviconMediaId,
      isContactEnabled: input.isContactEnabled,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFoundError("The settings could not be found.");
    }
    if (error instanceof ConflictError) {
      // Reachable only if the CHECK constraint rejects a write, which would
      // mean something tried to steer the singleton key, or if the social
      // image no longer exists.
      return conflictError(
        "The settings could not be saved. The chosen image may have been deleted.",
      );
    }
    console.error("[admin] settings save failed", error);
    return failureError();
  }

  // This route *is* the settings editor, so there is nowhere to redirect to.
  revalidatePath(SETTINGS_PATH);

  return success({ savedAt: saved.updatedAt });
}
