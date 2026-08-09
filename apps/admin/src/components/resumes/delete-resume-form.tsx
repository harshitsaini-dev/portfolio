"use client";

/**
 * Delete confirmation for a résumé record.
 *
 * Deletion is a POST through a Server Action, never a link or a GET — a
 * destructive GET can be triggered by a prefetch, a crawler, or an
 * `<img src>`. Confirmation is a two-step reveal rather than `window.confirm`,
 * which cannot be styled, is not reliably announced, and is suppressible.
 *
 * This removes the résumé **record**, not the PDF: `media_asset_id` is
 * `ON DELETE RESTRICT`, and silently deleting a file because one record
 * pointed at it would be a surprise rather than a convenience.
 *
 * The server re-authenticates regardless of anything this component does.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { deleteResumeAction } from "@/lib/actions/resumes";

export function DeleteResumeForm({
  resumeId,
  resumeLabel,
  isCurrent,
}: {
  resumeId: string;
  resumeLabel: string;
  /** Deleting the published résumé removes the public download entirely. */
  isCurrent: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteResumeAction,
    idleState,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirm button so a keyboard user is not left behind on
  // a button that just disappeared.
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
          Delete résumé
          <span className="sr-only"> {resumeLabel}</span>
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
      <input type="hidden" name="id" value={resumeId} />
      <p role="alert" className="text-sm font-medium text-fg">
        Delete “{resumeLabel}” permanently?
      </p>
      {/* Stated only when true, and stated as a consequence rather than as a
          warning label: this is the one delete on the site that removes
          something from the public page. */}
      {isCurrent ? (
        <p className="mt-2 text-sm text-fg-muted">
          This is the published résumé, so the download link will disappear
          from the public site until another is published.
        </p>
      ) : null}
      <p className="mt-2 text-sm text-fg-muted">
        The PDF itself stays in the media library.
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
