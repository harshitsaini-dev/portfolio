"use client";

/**
 * Delete confirmation for a technology.
 *
 * Deletion is a POST through a Server Action, never a link or a GET — a
 * destructive GET can be triggered by a prefetch, a crawler, or an
 * `<img src>`. Confirmation is a two-step reveal rather than
 * `window.confirm`, which cannot be styled, is not reliably announced, and
 * is suppressible.
 *
 * `usageCount` only decides what the UI *says* up front. It is not a
 * permission check: the authority is `ON DELETE RESTRICT` in the schema,
 * enforced on the server, which is what actually stops an in-use technology
 * from being removed even if this component were bypassed entirely.
 *
 * The server re-authenticates regardless of anything this component does.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { deleteTechnologyAction } from "@/lib/actions/technologies";

export function DeleteTechnologyForm({
  technologyId,
  technologyName,
  usageCount,
}: {
  technologyId: string;
  technologyName: string;
  usageCount: number;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteTechnologyAction,
    idleState,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirm button so a keyboard user is not left behind
  // on a button that just disappeared.
  useEffect(() => {
    if (isConfirming) confirmRef.current?.focus();
  }, [isConfirming]);

  const errorMessage = isErrorResult(state) ? state.message : null;
  const inUse = usageCount > 0;

  if (inUse) {
    // No delete control at all: offering a button whose only outcome is a
    // rejection is worse than explaining why it is unavailable.
    return (
      <div className="mt-5">
        <p className="text-sm text-fg">
          This technology is used by{" "}
          <strong className="font-semibold">
            {usageCount} project{usageCount === 1 ? "" : "s"}
          </strong>
          . Remove it from{" "}
          {usageCount === 1 ? "that project" : "those projects"} before deleting
          it.
        </p>
      </div>
    );
  }

  if (!isConfirming) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
        >
          Delete technology
          <span className="sr-only"> {technologyName}</span>
        </button>
        {errorMessage ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="id" value={technologyId} />
      <p role="alert" className="text-sm font-medium text-fg">
        Delete “{technologyName}” permanently?
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          ref={confirmRef}
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-danger-fg transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          type="button"
          onClick={() => setIsConfirming(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
