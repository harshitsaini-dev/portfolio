"use client";

import { useActionState } from "react";

import {
  changePasswordAction,
  requestPasswordChangeCodeAction,
} from "@/lib/auth/actions";
import { authIdleState } from "@/lib/auth/form-state";

/**
 * Two forms, side by side: ask for a code, then change the password with it.
 *
 * Separate rather than one form with a "send code" button, because they are
 * two submissions to two actions and pretending otherwise would mean managing
 * by hand the pending state that `useActionState` gives each of them for free.
 *
 * The code is requested first and typed into the second form. Nothing is
 * remembered between them on the client — the code lives in the database, and
 * the only copy the browser sees is the one the person types.
 */
export function ChangePassword({ email }: { email: string }) {
  const [codeState, requestCode, isRequesting] = useActionState(
    requestPasswordChangeCodeAction,
    authIdleState,
  );
  const [changeState, changePassword, isChanging] = useActionState(
    changePasswordAction,
    authIdleState,
  );

  const fieldClasses =
    "min-h-11 w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-md border border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">1. Get a code</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Sent to your own address. It expires in ten minutes.
        </p>
        <form action={requestCode} className="mt-3">
          <button
            type="submit"
            disabled={isRequesting}
            className="inline-flex min-h-11 items-center rounded-md border border-strong px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isRequesting ? "Sending…" : "Email me a code"}
          </button>
        </form>
        {codeState.message ? (
          <p
            role="status"
            className={`mt-3 text-sm ${codeState.status === "error" ? "text-danger" : "text-fg-muted"}`}
          >
            {codeState.message}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">2. Change the password</h2>
        <form action={changePassword} className="mt-3 flex flex-col gap-4">
          {/*
            The account this password belongs to, for the browser rather than
            for the person.

            A password form with no username in it is one a password manager
            cannot file against an account — it will offer to save "a password"
            with nothing to attach it to, and will not offer to fill it next
            time. Chrome says so in the console, which is where this came from.
            Hidden rather than shown: the page already says who is signed in,
            two lines above.
          */}
          <input
            type="text"
            name="email"
            value={email}
            readOnly
            autoComplete="username"
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
          />
          {changeState.message ? (
            <p
              role="alert"
              tabIndex={-1}
              className={
                changeState.status === "error"
                  ? "rounded-md border border-danger px-3 py-2 text-sm text-fg"
                  : "rounded-md border border-subtle px-3 py-2 text-sm text-fg-muted"
              }
            >
              {changeState.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="current" className="text-sm font-medium text-fg">
              Current password
            </label>
            <input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              className={fieldClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-medium text-fg">
              Code from your email
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${fieldClasses} text-center font-mono text-lg tracking-[0.3em]`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-fg">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={fieldClasses}
            />
            <p className="text-xs text-fg-muted">
              At least 12 characters. Length beats punctuation.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-sm font-medium text-fg">
              Repeat it
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              className={fieldClasses}
            />
          </div>

          <p className="text-xs text-fg-muted">
            Every other signed-in browser will be signed out. This one stays.
          </p>

          <button
            type="submit"
            disabled={isChanging}
            className="inline-flex min-h-11 items-center justify-center self-start rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isChanging ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>
    </section>
  );
}
