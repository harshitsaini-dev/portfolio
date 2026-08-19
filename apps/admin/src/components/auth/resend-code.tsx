"use client";

import { useActionState } from "react";

import { resendLoginCodeAction } from "@/lib/auth/actions";
import { authIdleState } from "@/lib/auth/form-state";

/**
 * "Send another code".
 *
 * A form rather than a button with an `onClick`, so it works before hydration
 * and so the pending state comes from the framework rather than from state
 * this component would have to keep in step.
 *
 * Rate-limited on the server at three an hour — an unlimited resend is a way
 * to use somebody's inbox as a target, and the limit is enforced where it
 * cannot be skipped rather than by disabling this button.
 */
export function ResendCode() {
  const [state, formAction, isPending] = useActionState(
    resendLoginCodeAction,
    authIdleState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.message ? (
        <p
          role="status"
          className={
            state.status === "error"
              ? "text-xs text-danger"
              : "text-xs text-fg-muted"
          }
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 items-center self-start rounded-md px-2 text-sm text-accent underline underline-offset-4 transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Sending…" : "Send another code"}
      </button>
    </form>
  );
}
