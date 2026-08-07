"use client";

/**
 * Delete confirmation for a skill category.
 *
 * Deletion is a POST through a Server Action, never a link or a GET — a
 * destructive GET can be triggered by a prefetch, a crawler, or an
 * `<img src>`. Confirmation is a two-step reveal rather than
 * `window.confirm`, which cannot be styled, is not reliably announced, and
 * is suppressible.
 *
 * `skillCount` only decides what the UI *says* up front. It is not a
 * permission check: the authority is `ON DELETE RESTRICT` on
 * `skills.category_id`, enforced by the database, which is what actually
 * stops a category still holding skills from being removed even if this
 * component were bypassed entirely. Nothing here deletes child skills to make
 * the parent deletion succeed — that is exactly what the constraint prevents.
 *
 * The server re-authenticates regardless of anything this component does.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { deleteSkillCategoryAction } from "@/lib/actions/skills";

export function DeleteSkillCategoryForm({
  categoryId,
  categoryName,
  skillCount,
}: {
  categoryId: string;
  categoryName: string;
  skillCount: number;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteSkillCategoryAction,
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
  const inUse = skillCount > 0;

  if (inUse) {
    // No delete control at all: offering a button whose only outcome is a
    // rejection is worse than explaining why it is unavailable.
    //
    // The instruction names only what this CMS can actually do. Suggesting
    // the editor move the skills elsewhere would advertise an operation that
    // does not exist here — `categoryId` is not updatable, so there is no
    // way to act on that advice.
    return (
      <div className="mt-5">
        <p className="text-sm text-fg">
          This category still contains{" "}
          <strong className="font-semibold">
            {skillCount} skill{skillCount === 1 ? "" : "s"}
          </strong>
          . Delete {skillCount === 1 ? "that skill" : "those skills"} before
          deleting this category.
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
          Delete category
          <span className="sr-only"> {categoryName}</span>
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
      <input type="hidden" name="id" value={categoryId} />
      <p role="alert" className="text-sm font-medium text-fg">
        Delete “{categoryName}” permanently?
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
