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
 * ## Validation is the page's, not the browser's
 *
 * `noValidate` on the form, and the checks re-implemented below. That looks
 * like giving up something for nothing, so it is worth writing down why:
 * the browser's own bubble is an operating-system tooltip. It cannot be
 * styled, it renders in the OS light theme on top of a dark page, it says
 * "Please fill out this field" in the browser's language rather than the
 * page's, it points at one field at a time, and it vanishes on the next
 * keystroke — so a screen reader announces it once, if at all.
 *
 * The replacement keeps everything the native behaviour was doing: nothing is
 * submitted while it is invalid, the first bad field takes focus, and each
 * message is tied to its input with `aria-describedby` and `aria-invalid`.
 * It adds what the native version cannot do — messages that stay put, in the
 * page's own colours, and a cross-field rule the browser has no concept of.
 *
 * The server validates all of it again regardless. Client-side checking is a
 * courtesy to someone filling in a form, never a control: `noValidate` is one
 * line for an attacker too.
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

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { HONEYPOT_FIELD } from "@portfolio/schemas";

import { sendContactMessageAction } from "@/lib/actions/contact";
import {
  contactIdleState,
  type ContactFormState,
} from "@/lib/actions/contact-state";
import { actionVariant } from "@/components/ui/action";
import { type } from "@/components/ui/typography";
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
} from "@/components/ui/country-codes";

/*
  Everything a field looks like, except how wide it is.

  Width is separate because two controls here are not full width, and
  `w-full` from a shared string cannot be overridden by adding `w-24` next to
  it: both are utilities of the same specificity, so which one wins is decided
  by Tailwind's own output order rather than by the order they are written in.
  Measured the hard way — the country selector came out 419px wide and left
  the number field 26px.
*/
const fieldBase =
  "min-h-11 rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-danger";

const fieldClasses = `${fieldBase} w-full`;

/** The client-side rules, in one place so the messages read consistently. */
type ClientErrors = Partial<Record<string, string[]>>;

function validate(form: HTMLFormElement): ClientErrors {
  const value = (name: string) =>
    (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ??
    "";

  const errors: ClientErrors = {};

  if (value("senderName").length === 0) errors.senderName = ["Enter your name"];
  if (value("body").length === 0) errors.body = ["Write a message"];

  const email = value("senderEmail");
  const phone = value("senderPhone");

  // Shape only, and deliberately loose — the same reasoning as the server's
  // schema. A stricter test here would reject a valid address before the
  // server ever got the chance to accept it.
  if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.senderEmail = ["Enter a valid email address"];
  }
  if (phone.length > 0 && !/\d/.test(phone)) {
    errors.senderPhone = ["Enter a phone number"];
  }

  /*
    One way to reply is required; two are welcome.

    Reported on both fields rather than once at the top, because a rule shown
    only in a summary is a rule people read after they have given up. The
    browser cannot express this at all — `required` on both would demand both,
    and on neither would demand nothing.
  */
  if (email.length === 0 && phone.length === 0) {
    const message = "Add an email address or a phone number";
    errors.senderEmail = [...(errors.senderEmail ?? []), message];
    errors.senderPhone = [...(errors.senderPhone ?? []), message];
  }

  return errors;
}

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

  const serverErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  /*
    The client's answer wins while it exists.

    Both can be present at once — a server reply from the previous submission
    and a fresh client check on this one — and showing both would mean the same
    field carrying a stale message underneath a current one. The client's is
    the newer of the two by construction: it was computed from what is in the
    boxes right now.
  */
  const fieldErrors: ClientErrors = { ...serverErrors, ...clientErrors };

  /**
   * Runs the checks, and stops the submission if any fail.
   *
   * Focus moves to the first bad field, which is the part of the native
   * behaviour worth keeping: a keyboard user must not have to hunt for what
   * went wrong.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const errors = validate(form);
    setClientErrors(errors);

    const firstBad = Object.keys(errors)[0];
    if (!firstBad) return;

    event.preventDefault();
    const field = form.elements.namedItem(firstBad);
    if (field instanceof HTMLElement) field.focus();
  }

  /** Clears a field's message as soon as it is being corrected. */
  function clearError(name: string) {
    setClientErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      // The cross-field rule was reported on both, so correcting either one
      // has to clear both — otherwise typing an email leaves "add an email or
      // a phone number" sitting under the phone field.
      if (name === "senderEmail") delete next.senderPhone;
      if (name === "senderPhone") delete next.senderEmail;
      return next;
    });
  }

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
        {/* "the address you gave" was true when an address was the only
            thing the form accepted. Somebody who left a phone number instead
            would have been promised a reply somewhere they never mentioned. */}
        Thanks — your message has been sent. I read these myself and will get
        back to you.
      </p>
    );
  }

  return (
    // Fills its column rather than capping at `max-w-md`. The cap existed to
    // stop the fields stretching across a full-width panel; the section now
    // gives this a column of its own, so the cap only left dead space.
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      /* The browser's own bubbles are switched off — see the module comment
         for what replaces them and why. */
      noValidate
      className="flex w-full flex-col gap-3"
    >
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
          maxLength={120}
          autoComplete="name"
          onInput={() => clearError("senderName")}
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
          Email
        </label>
        <input
          placeholder="Email"
          id={`${fieldId}-email`}
          name="senderEmail"
          /* `type="email"` still, for the keyboard it asks a phone for and
             the autofill it invites. Its validation is inert under
             `noValidate`, which is the point. */
          type="email"
          maxLength={254}
          autoComplete="email"
          onInput={() => clearError("senderEmail")}
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

      {/*
        The phone, with its dialling prefix beside it.

        Two controls, one field. The prefix is a `<select>` rather than
        something typed, because the set of valid answers is short and known,
        and because a prefix that arrives as free text ends up in a `tel:`
        link the owner presses. The number itself is *not* constrained beyond
        containing a digit — see the schema for why a stricter rule would
        reject a real person's real number.

        `w-auto` on the select and `flex-1` on the input, so the prefix takes
        the width its longest option needs and the number takes the rest.
      */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <label htmlFor={`${fieldId}-phone-country`} className="sr-only">
            Country dialling code
          </label>
          <select
            id={`${fieldId}-phone-country`}
            name="senderPhoneCountry"
            defaultValue={DEFAULT_COUNTRY_CODE}
            /*
              A fixed, narrow width.

              `w-auto` was the first attempt and it took nearly the whole row:
              a `<select>` sizes itself to its longest option, and "United Arab
              Emirates" is long. The number field was left as a sliver.
            */
            className={`${fieldBase} w-24 shrink-0`}
          >
            {COUNTRY_CODES.map((entry) => (
              // `iso` in the key because a prefix is not unique — +1 is both
              // the United States and Canada, and React would warn.
              //
              // "IN +91" rather than "India +91" because a browser sizes the
              // open list to the control, so a long country name is truncated
              // in the one place it would actually be read. Two letters and a
              // prefix fit whole, and the label names the control for anybody
              // who cannot see the shape of it.
              <option key={entry.iso} value={entry.code} title={entry.name}>
                {entry.iso} {entry.code}
              </option>
            ))}
          </select>

          <label htmlFor={`${fieldId}-phone`} className="sr-only">
            Phone number
          </label>
          <input
            placeholder="Phone (optional)"
            id={`${fieldId}-phone`}
            name="senderPhone"
            type="tel"
            maxLength={30}
            autoComplete="tel-national"
            onInput={() => clearError("senderPhone")}
            aria-describedby={
              fieldErrors.senderPhone ? `${fieldId}-phone-error` : undefined
            }
            aria-invalid={fieldErrors.senderPhone ? true : undefined}
            className={`${fieldBase} min-w-0 flex-1`}
          />
        </div>
        <FieldError
          id={`${fieldId}-phone-error`}
          errors={fieldErrors.senderPhone}
        />
      </div>

      {/* Said once, plainly, rather than left for somebody to discover by
          submitting an empty form. */}
      <p className={type.fine}>
        Leave an email address or a phone number — whichever you would rather
        be reached on.
      </p>

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
          rows={3}
          onInput={() => clearError("body")}
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
