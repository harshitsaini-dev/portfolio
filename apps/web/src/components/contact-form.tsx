"use client";

/**
 * The public contact form.
 *
 * The second and last client component on this site. It needs to be one:
 * `useActionState` carries the server's reply back into the page without a
 * navigation, and the honeypot's timestamp has to be stamped in the browser
 * at render time.
 *
 * ## Accessibility
 *
 * Every field is labelled and wired to its own error with `aria-describedby`
 * and `aria-invalid`. The form-level result is a `role="status"` region that
 * takes focus after a submission, so a screen-reader user hears the outcome
 * instead of being left at the send button wondering.
 *
 * ## The honeypot is hidden from people, not from bots
 *
 * `aria-hidden` plus `tabIndex={-1}` plus off-screen positioning: a sighted
 * visitor never sees it, a keyboard never lands on it, and a screen reader
 * never announces it. **Not `display: none`** — some bots skip hidden inputs,
 * and one that skips this field would pass the check it exists to fail.
 *
 * `autoComplete="off"` matters here too: without it a browser's autofill can
 * put a real value into a field named `website` and reject an honest visitor.
 */

import { useActionState, useEffect, useId, useRef } from "react";

import { HONEYPOT_FIELD } from "@portfolio/schemas";

import { sendContactMessageAction } from "@/lib/actions/contact";
import {
  contactIdleState,
  type ContactFormState,
} from "@/lib/actions/contact-state";
import { actionVariant } from "@/components/ui/action";
import { type } from "@/components/ui/typography";

const fieldClasses =
  "min-h-11 w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted/70";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <p id={id} className="text-xs font-medium text-danger">
      {errors.join(" ")}
    </p>
  );
}

export function ContactForm() {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState<ContactFormState, FormData>(
    sendContactMessageAction,
    contactIdleState,
  );
  const resultRef = useRef<HTMLParagraphElement>(null);

  /**
   * When this form was rendered.
   *
   * Written straight to the input's DOM value in an effect, rather than held
   * in state. Two lint rules pushed this here and both are right:
   * `Date.now()` is impure and must not be called while rendering — `useMemo`
   * included, since React may discard and recompute it — and calling
   * `setState` synchronously in an effect triggers a cascading render. A ref
   * write does neither: it happens once after mount and re-renders nothing.
   *
   * The field is empty until then. A submission that somehow beat it sends
   * nothing, the schema requires a positive integer, and the result is a
   * generic rejection — failing closed, which is the right direction for a
   * check that exists to reject automation.
   */
  const startedAtRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const field = startedAtRef.current;
    if (field) field.value = String(Date.now());
  }, []);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  // Move focus to the outcome so it is announced and not missed.
  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <p
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className={`rounded-md border border-subtle bg-surface p-6 ${type.body}`}
      >
        Thanks — your message has been sent. I read these myself and will reply
        to the address you gave.
      </p>
    );
  }

  return (
    // Fills its column rather than capping at `max-w-md`. The cap existed to
    // stop the fields stretching across a full-width panel; the section now
    // gives this a column of its own, so the cap only left dead space.
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input ref={startedAtRef} type="hidden" name="startedAt" defaultValue="" />

      {/* The honeypot. See the module comment for why it is positioned
          off-screen rather than display:none. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor={`${fieldId}-${HONEYPOT_FIELD}`}>
          Leave this field empty
        </label>
        <input
          id={`${fieldId}-${HONEYPOT_FIELD}`}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <p
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className={
          state.status === "error"
            ? "rounded-md border border-danger bg-surface p-4 text-sm text-fg"
            : "sr-only"
        }
      >
        {state.status === "error" ? state.message : ""}
      </p>

      {/* Name and email share a row from `lg` up: two short fields stacked
          made the form taller than it needed to be.

          `lg` rather than `sm`, because the form now sits in a column beside
          the section's copy from `md` up. Splitting at `sm` would put two
          inputs into a ~340px column at 768px wide, which is narrow enough
          that neither placeholder fits. */}
      <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        {/*
          The label is visually hidden and the placeholder carries the visible
          text. A placeholder alone is not a label — it disappears on the
          first keystroke and screen readers treat it inconsistently — so the
          real label stays in the DOM for assistive technology.
        */}
        <label htmlFor={`${fieldId}-name`} className="sr-only">
          Name (required)
        </label>
        <input
          placeholder="Name"
          id={`${fieldId}-name`}
          name="senderName"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          aria-describedby={
            fieldErrors.senderName ? `${fieldId}-name-error` : undefined
          }
          aria-invalid={fieldErrors.senderName ? true : undefined}
          className={fieldClasses}
        />
        <FieldError id={`${fieldId}-name-error`} errors={fieldErrors.senderName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${fieldId}-email`} className="sr-only">
          Email (required)
        </label>
        <input
          placeholder="Email"
          id={`${fieldId}-email`}
          name="senderEmail"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          aria-describedby={
            fieldErrors.senderEmail ? `${fieldId}-email-error` : undefined
          }
          aria-invalid={fieldErrors.senderEmail ? true : undefined}
          className={fieldClasses}
        />
        <FieldError
          id={`${fieldId}-email-error`}
          errors={fieldErrors.senderEmail}
        />
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${fieldId}-subject`} className="sr-only">
          Subject
        </label>
        <input
          placeholder="Subject (optional)"
          id={`${fieldId}-subject`}
          name="subject"
          type="text"
          maxLength={160}
          aria-describedby={
            fieldErrors.subject ? `${fieldId}-subject-error` : undefined
          }
          aria-invalid={fieldErrors.subject ? true : undefined}
          className={fieldClasses}
        />
        <FieldError id={`${fieldId}-subject-error`} errors={fieldErrors.subject} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${fieldId}-body`} className="sr-only">
          Message (required)
        </label>
        <textarea
          placeholder="Message"
          id={`${fieldId}-body`}
          name="body"
          required
          rows={3}
          maxLength={4000}
          aria-describedby={
            fieldErrors.body ? `${fieldId}-body-error` : undefined
          }
          aria-invalid={fieldErrors.body ? true : undefined}
          className={`${fieldClasses} min-h-28`}
        />
        <FieldError id={`${fieldId}-body-error`} errors={fieldErrors.body} />
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className={`inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70 ${actionVariant.primary}`}
        >
          {isPending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
