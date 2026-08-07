"use client";

/**
 * Delete confirmation for a page section.
 *
 * Deletion is a POST through a Server Action, never a link or a GET — a
 * destructive GET can be triggered by a prefetch, a crawler, or an
 * `<img src>`. Confirmation is a two-step reveal rather than
 * `window.confirm`, which cannot be styled, is not reliably announced, and
 * is suppressible.
 *
 * Nothing references `sections`, so this removes one row and cascades to
 * nothing.
 *
 * The confirmation names the section's **title and key** together: the title
 * is what the editor recognises, and the key is what the public site is
 * wired to, so losing it has consequences the title alone does not convey.
 *
 * The server re-authenticates regardless of anything this component does.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { deleteSectionAction } from "@/lib/actions/sections";

export function DeleteSectionForm({
  sectionId,
  sectionTitle,
  sectionKey,
}: {
  sectionId: string;
  sectionTitle: string;
  sectionKey: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteSectionAction,
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
  const label = `${sectionTitle} (${sectionKey})`;

  if (!isConfirming) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
        >
          Delete section
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
      <input type="hidden" name="id" value={sectionId} />
      <p role="alert" className="text-sm font-medium text-fg">
        Delete “{sectionTitle}” permanently? Its key{" "}
        <span className="font-mono">{sectionKey}</span> becomes available
        again, and any public component mapped to it will have no section to
        render.
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
