"use server";

/**
 * Inbox Server Actions.
 *
 * The same order as every other action module: authorization first,
 * validation of the untrusted payload, the repository layer, then a safe
 * mapping of known failures.
 *
 * ## There is no create action, and that is the point
 *
 * Messages arrive from the public site. The admin can only change a
 * message's status or delete it — it cannot author one, which would let the
 * inbox contain something nobody sent.
 *
 * ## Delete is permanent and separate
 *
 * `archived` and `spam` are statuses; the message is still there. Delete
 * removes the row, which is why it is its own action with its own
 * confirmation in the UI rather than a fourth status.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NotFoundError } from "@portfolio/database";
import {
  contactMessageIdSchema,
  contactMessageStatusSchema,
} from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  failureError,
  notFoundError,
  validationError,
  type ActionState,
} from "./result.ts";

const LIST_PATH = "/inbox";

export interface InboxMutationData {
  readonly id: string;
}

export async function setMessageStatusAction(
  _previous: ActionState<InboxMutationData>,
  formData: FormData,
): Promise<ActionState<InboxMutationData>> {
  await requireAdminIdentity();

  const id = contactMessageIdSchema.safeParse(formData.get("id"));
  if (!id.success) {
    return validationError({ form: ["Missing message identifier."] });
  }
  const status = contactMessageStatusSchema.safeParse(formData.get("status"));
  if (!status.success) {
    return validationError({ form: ["Unknown status."] });
  }

  try {
    const repos = await getAdminRepositories();
    // The repository stamps `read_at` on the first transition to `read`; that
    // is its rule, not this action's, so nothing here touches timestamps.
    await repos.contactMessages.setStatus(id.data, status.data);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFoundError("That message no longer exists.");
    }
    console.error("[admin] inbox status change failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id.data}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deleteMessageAction(
  _previous: ActionState<InboxMutationData>,
  formData: FormData,
): Promise<ActionState<InboxMutationData>> {
  await requireAdminIdentity();

  const id = contactMessageIdSchema.safeParse(formData.get("id"));
  if (!id.success) {
    return validationError({ form: ["Missing message identifier."] });
  }

  try {
    const repos = await getAdminRepositories();
    const removed = await repos.contactMessages.delete(id.data);
    if (!removed) return notFoundError("That message no longer exists.");
  } catch (error) {
    console.error("[admin] inbox delete failed", error);
    return failureError();
  }

  revalidatePath(LIST_PATH);
  // Redirect OUTSIDE the try: `redirect()` signals by throwing, so calling it
  // inside would be caught above and reported as a failure.
  redirect(`${LIST_PATH}?deleted=1`);
}
