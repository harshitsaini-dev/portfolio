"use client";

/**
 * Delete confirmation for a media asset.
 *
 * Deletion is a POST through a Server Action, never a link or a GET — a
 * destructive GET can be triggered by a prefetch, a crawler, or an
 * `<img src>`. Confirmation is a two-step reveal rather than
 * `window.confirm`, which cannot be styled, is not reliably announced, and
 * is suppressible.
 *
 * The copy says what deletion actually costs: the object is removed from
 * storage, not just its row. It does not promise the asset can be recovered.
 *
 * An asset that is still referenced is **refused by the service**, and the
 * refusal names every place it is used. That check lives on the server
 * precisely because two of the four references are `ON DELETE SET NULL` —
 * the database would carry the delete out and silently clear a project cover.
 * The server re-authenticates regardless of anything this component does.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { deleteMediaAssetAction } from "@/lib/actions/media";

export function DeleteMediaForm({
  assetId,
  label,
}: {
  assetId: string;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteMediaAssetAction,
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

  if (!isConfirming) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
        >
          Delete file
          <span className="sr-only"> {label}</span>
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
      <input type="hidden" name="id" value={assetId} />
      <p role="alert" className="text-sm font-medium text-fg">
        Delete “{label}” permanently? The file is removed from storage as well
        as from this list. If anything still uses it, the deletion is refused
        and you will be told where.
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
