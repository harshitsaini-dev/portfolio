"use client";

import { useActionState } from "react";

import { authIdleState, type AuthFormState } from "@/lib/auth/form-state";

/**
 * The shared parts of every form in the login.
 *
 * Five forms with the same anatomy — fields, one result region, a submit
 * button that reports its own pending state. Written once so a message cannot
 * end up announced on one page and silent on another.
 *
 * ## The result region is a live region, and it takes focus
 *
 * Everything these forms say back is a refusal, and a refusal that only
 * appears visually is a refusal a screen-reader user does not hear. It is
 * `role="alert"`, so it is announced when it changes, and focusable, so the
 * page's own error can be reached rather than hunted for.
 *
 * ## No client-side validation here
 *
 * Unlike the public contact form, which checks before it posts. The rules that
 * matter on these pages — is this the right password, is this the right code —
 * cannot be checked in a browser at all, and a length check that passes
 * locally then fails on the server would be two different messages for one
 * mistake. The one exception is the new-password form, where "the two do not
 * match" is genuinely knowable here; even that is checked again on the server,
 * because everything is.
 */

export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  children,
}: {
  action: (
    previous: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  submitLabel: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, authIdleState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p
          role="alert"
          tabIndex={-1}
          className={
            state.status === "error"
              ? "rounded-md border border-danger bg-surface px-3 py-2 text-sm text-fg"
              : "rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-fg-muted"
          }
        >
          {state.message}
        </p>
      ) : null}

      {children}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

/** One labelled field. The label is visible — this is not a marketing page. */
export function AuthField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  hint,
  autoFocus,
  inputMode,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel";
  autoComplete?: string;
  hint?: string;
  autoFocus?: boolean;
  inputMode?: "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        /* Autofocus is safe here and would not be elsewhere: these are
           single-purpose pages whose only content is this form, so the caret
           belongs in the first field. The usual objection — that stealing
           focus scrolls a long page out from under somebody — cannot apply
           when the form is the page. */
        autoFocus={autoFocus}
        className="min-h-11 w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * The six-digit box.
 *
 * Its own component because the details are not obvious and are worth getting
 * right in one place: a numeric keypad on a phone, `one-time-code` so both iOS
 * and Android offer the code straight from the notification, and wide spaced
 * monospace so a code copied by eye can be checked against the email.
 *
 * `maxLength` rather than a pattern — the server decides what is valid, and a
 * browser refusing to accept a seventh character is help, not a rule.
 */
export function CodeField({ id }: { id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        Six-digit code
      </label>
      <input
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        /* See `AuthField`. This page is one box and a button. */
        autoFocus
        className="min-h-11 w-full rounded-md border border-strong bg-surface px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
    </div>
  );
}
