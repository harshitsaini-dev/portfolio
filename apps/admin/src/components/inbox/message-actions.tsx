"use client";

/**
 * Status controls and delete for one message.
 *
 * Two forms rather than one, because they are two different kinds of action:
 * a status change is reversible and needs no confirmation, while delete
 * removes the row and does. Putting them in one form would mean one submit
 * handler deciding which happened, which is the shape that eventually deletes
 * something the editor meant to archive.
 *
 * The confirmation is a two-step reveal rather than `window.confirm`: a
 * native dialog cannot be styled, is suppressed by some browsers, and reads
 * poorly to a screen reader compared to a labelled region on the page.
 */

import { useActionState, useState } from "react";

import type { ContactMessageStatus } from "@portfolio/types";

import {
  deleteMessageAction,
  setMessageStatusAction,
  type InboxMutationData,
} from "@/lib/actions/inbox";
import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";

type InboxAction = (
  previous: ActionState<InboxMutationData>,
  formData: FormData,
) => Promise<ActionState<InboxMutationData>>;

const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70";

function StatusButton({
  messageId,
  status,
  label,
  action,
}: {
  messageId: string;
  status: ContactMessageStatus;
  label: string;
  action: InboxAction;
}) {
  const [state, formAction, isPending] = useActionState(action, idleState);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={messageId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={isPending} className={quietButton}>
        {isPending ? "Saving…" : label}
      </button>
      {isErrorResult(state) ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function MessageActions({
  messageId,
  status,
}: {
  messageId: string;
  status: ContactMessageStatus;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteMessageAction,
    idleState,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Only the transitions that mean something from here. Offering
            "mark read" on a message that is already read is a button that
            does nothing. */}
        {status !== "read" ? (
          <StatusButton
            messageId={messageId}
            status="read"
            label="Mark as read"
            action={setMessageStatusAction}
          />
        ) : null}
        {status !== "unread" ? (
          <StatusButton
            messageId={messageId}
            status="unread"
            label="Mark as unread"
            action={setMessageStatusAction}
          />
        ) : null}
        {status !== "archived" ? (
          <StatusButton
            messageId={messageId}
            status="archived"
            label="Archive"
            action={setMessageStatusAction}
          />
        ) : null}
        {status !== "spam" ? (
          <StatusButton
            messageId={messageId}
            status="spam"
            label="Mark as spam"
            action={setMessageStatusAction}
          />
        ) : null}
      </div>

      <section
        aria-labelledby="delete-message-heading"
        className="rounded-lg border border-danger/40 bg-surface p-6"
      >
        <h2
          id="delete-message-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Delete
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          Archiving and marking as spam both keep the message. Deleting removes
          it permanently.
        </p>

        {confirming ? (
          <form action={deleteAction} className="mt-5 flex flex-wrap gap-3">
            <input type="hidden" name="id" value={messageId} />
            <button
              type="submit"
              disabled={isDeleting}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-danger-fg transition-colors duration-150 hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isDeleting ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={quietButton}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-danger px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
          >
            Delete message
          </button>
        )}

        {isErrorResult(deleteState) ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {deleteState.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
