"use client";

/**
 * Create/edit form for a social link.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth — the `type="url"` input is a
 * keyboard/UX affordance, never the validation.
 *
 * **`platform` is a plain text input, deliberately.** The column is
 * `platform TEXT NOT NULL` with no CHECK, enum, or lookup table, so a
 * `<select>` here would invent a vocabulary the database does not have —
 * rejecting values the schema permits and going stale as platforms come and
 * go. The editor types what the platform is called.
 *
 * All three text fields are required: `social_links` has no nullable
 * columns, so this form never normalises anything to `null`.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { SocialLinkMutationData } from "@/lib/actions/socials";
import {
  CheckboxField,
  TextField,
} from "@/components/form/field";

export interface SocialLinkFormValues {
  label: string;
  platform: string;
  url: string;
  position: number;
  isVisible: boolean;
}

export const emptySocialLinkValues: SocialLinkFormValues = {
  label: "",
  platform: "",
  url: "",
  position: 0,
  isVisible: true,
};

type SocialLinkAction = (
  previous: ActionState<SocialLinkMutationData>,
  formData: FormData,
) => Promise<ActionState<SocialLinkMutationData>>;

export function SocialLinkForm({
  action,
  socialLinkId,
  initialValues,
  submitLabel,
}: {
  action: SocialLinkAction;
  socialLinkId?: string;
  initialValues: SocialLinkFormValues;
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SocialLinkFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SocialLinkFormValues>(
    key: K,
    value: SocialLinkFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify({
    ...values,
    position: Number.isFinite(values.position) ? values.position : 0,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {socialLinkId ? (
        <input type="hidden" name="id" value={socialLinkId} />
      ) : null}

      {/* Error summary. `role="alert"` announces it; tabIndex lets the effect
          move focus here. */}
      <div
        ref={summaryRef}
        tabIndex={-1}
        role={errorMessage ? "alert" : undefined}
        className={
          errorMessage
            ? "rounded-md border border-danger bg-surface p-4 text-sm text-fg"
            : "sr-only"
        }
      >
        {errorMessage ? (
          <>
            <strong className="font-semibold text-danger">
              {state.status === "conflict" ? "Conflict" : "Could not save"}
            </strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      <section
        aria-labelledby={`${fieldId}-link`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-link`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Link
        </h2>

        <TextField
          id={`${fieldId}-label`}
          name="label"
          label="Label"
          required
          value={values.label}
          errors={fieldErrors.label}
          hint="How the link is described, e.g. “GitHub profile”."
          onChange={(value) => update("label", value)}
        />

        <TextField
          id={`${fieldId}-platform`}
          name="platform"
          label="Platform"
          required
          value={values.platform}
          errors={fieldErrors.platform}
          hint="The service this link points to, e.g. “GitHub”. Free text — any platform name is accepted."
          onChange={(value) => update("platform", value)}
        />

        <TextField
          id={`${fieldId}-url`}
          name="url"
          label="URL"
          type="url"
          required
          value={values.url}
          errors={fieldErrors.url}
          hint="Required. Must start with http:// or https://."
          onChange={(value) => update("url", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-display`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-display`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Display
        </h2>

        <TextField
          id={`${fieldId}-position`}
          name="position"
          label="Position"
          type="number"
          min={0}
          value={String(values.position)}
          errors={fieldErrors.position}
          hint="Display order. Lower numbers appear first."
          onChange={(value) => update("position", Number(value))}
        />

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Uncheck to hide this link from the public site. It stays listed here."
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        <Link
          href="/socials"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
