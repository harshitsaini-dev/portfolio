"use client";

/**
 * "Publish" — make one résumé the current one.
 *
 * A POST through a Server Action rather than a link, like every other
 * mutation here: this changes what the public site serves, and a GET that
 * changes state can be fired by a prefetch or a crawler.
 *
 * No confirmation step. It is reversible by publishing another, it destroys
 * nothing, and a confirmation on a one-click switch is friction without a
 * benefit — unlike delete, where the two-step reveal is earned.
 *
 * The repository clears the previously current row in the same batch, so
 * there is never a moment when two rows claim `is_current` — which the
 * partial unique index would reject anyway.
 */

import { useActionState } from "react";

import { idleState, isErrorResult } from "@/lib/actions/result";
import { makeResumeCurrentAction } from "@/lib/actions/resumes";

export function MakeCurrentForm({
  resumeId,
  resumeLabel,
}: {
  resumeId: string;
  resumeLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(
    makeResumeCurrentAction,
    idleState,
  );
  const errorMessage = isErrorResult(state) ? state.message : null;

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={resumeId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Publishing…" : "Publish"}
        <span className="sr-only"> {resumeLabel}</span>
      </button>
      {errorMessage ? (
        <span role="alert" className="ml-2 text-sm font-medium text-danger">
          {errorMessage}
        </span>
      ) : null}
    </form>
  );
}
