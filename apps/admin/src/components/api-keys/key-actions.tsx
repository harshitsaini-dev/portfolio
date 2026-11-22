"use client";

/**
 * Revoke and delete for one key.
 *
 * Revoke is the normal action: the key stops working on the next request and
 * stays in the list, so an old log line naming its prefix can still be
 * explained. Delete removes the row and only appears once a key is revoked —
 * deleting a live key would be a revoke that also hides the evidence.
 */

import { useActionState, useState } from "react";

import { deleteApiKeyAction, revokeApiKeyAction } from "@/lib/actions/api-keys";
import { idleState, isErrorResult } from "@/lib/actions/result";

const dangerButton =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-3 text-sm font-medium text-danger-fg transition-colors duration-150 hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-70";
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70";

export function KeyActions({
  id,
  name,
  revoked,
}: {
  id: string;
  name: string;
  revoked: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(
    revoked ? deleteApiKeyAction : revokeApiKeyAction,
    idleState,
  );
  const verb = revoked ? "Delete" : "Revoke";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={isPending} className={dangerButton}>
            {isPending ? `${verb}…` : `Yes, ${verb.toLowerCase()}`}
            <span className="sr-only"> {name}</span>
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
          className={quietButton}
        >
          {verb}
          <span className="sr-only"> {name}</span>
        </button>
      )}
      {isErrorResult(state) ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
