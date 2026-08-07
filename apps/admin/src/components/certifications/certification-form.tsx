"use client";

/**
 * Create/edit form for a certification.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth — the `type="url"` input below
 * is a keyboard/UX affordance, never the validation.
 *
 * Certifications own no child rows, so this is a flat form: the education
 * form with a credential pair in place of the study fields.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { CertificationMutationData } from "@/lib/actions/certifications";
import {
  CheckboxField,
  TextField,
} from "@/components/form/field";

export interface CertificationFormValues {
  title: string;
  issuer: string;
  credentialId: string;
  credentialUrl: string;
  issuedOn: string;
  expiresOn: string;
  position: number;
  isVisible: boolean;
}

export const emptyCertificationValues: CertificationFormValues = {
  title: "",
  issuer: "",
  credentialId: "",
  credentialUrl: "",
  issuedOn: "",
  expiresOn: "",
  position: 0,
  isVisible: true,
};

type CertificationAction = (
  previous: ActionState<CertificationMutationData>,
  formData: FormData,
) => Promise<ActionState<CertificationMutationData>>;

export function CertificationForm({
  action,
  certificationId,
  initialValues,
  submitLabel,
}: {
  action: CertificationAction;
  certificationId?: string;
  initialValues: CertificationFormValues;
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<CertificationFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof CertificationFormValues>(
    key: K,
    value: CertificationFormValues[K],
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
      {certificationId ? (
        <input type="hidden" name="id" value={certificationId} />
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
        aria-labelledby={`${fieldId}-credential`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-credential`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Credential
        </h2>

        <TextField
          id={`${fieldId}-title`}
          name="title"
          label="Title"
          required
          value={values.title}
          errors={fieldErrors.title}
          hint="The certification’s name, e.g. “AWS Solutions Architect – Associate”."
          onChange={(value) => update("title", value)}
        />

        <TextField
          id={`${fieldId}-issuer`}
          name="issuer"
          label="Issuer"
          required
          value={values.issuer}
          errors={fieldErrors.issuer}
          hint="The organisation that awarded it."
          onChange={(value) => update("issuer", value)}
        />

        <TextField
          id={`${fieldId}-credential-id`}
          name="credentialId"
          label="Credential ID"
          value={values.credentialId}
          errors={fieldErrors.credentialId}
          hint="Optional reference code printed on the credential."
          onChange={(value) => update("credentialId", value)}
        />

        <TextField
          id={`${fieldId}-credential-url`}
          name="credentialUrl"
          label="Credential URL"
          type="url"
          value={values.credentialUrl}
          errors={fieldErrors.credentialUrl}
          hint="Optional verification link. Must start with http:// or https://."
          onChange={(value) => update("credentialUrl", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-dates`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-dates`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Dates and display
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={`${fieldId}-issued`}
            name="issuedOn"
            label="Issued on"
            type="date"
            value={values.issuedOn}
            errors={fieldErrors.issuedOn}
            hint="Optional. Used for sorting."
            onChange={(value) => update("issuedOn", value)}
          />
          <TextField
            id={`${fieldId}-expires`}
            name="expiresOn"
            label="Expires on"
            type="date"
            value={values.expiresOn}
            errors={fieldErrors.expiresOn}
            hint="Optional. Leave empty if it does not expire."
            onChange={(value) => update("expiresOn", value)}
          />
        </div>

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
          hint="Uncheck to hide this certification from the public site. It stays listed here."
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
          href="/certifications"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
