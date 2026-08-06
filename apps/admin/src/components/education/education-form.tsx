"use client";

/**
 * Create/edit form for an education entry.
 *
 * The established architecture, unchanged: no form library,
 * `useActionState` for pending state and server-returned errors, the shared
 * field primitives for labelling and ARIA wiring, and an error summary that
 * takes focus. Server-side Zod remains the source of truth.
 *
 * Education owns no child rows, so this is the plainest CMS form in the
 * admin — the sibling of the timeline form with its highlight editor
 * removed.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { EducationMutationData } from "@/lib/actions/education";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/components/form/field";

export interface EducationFormValues {
  qualification: string;
  institution: string;
  fieldOfStudy: string;
  summary: string;
  periodLabel: string;
  startedOn: string;
  endedOn: string;
  position: number;
  isVisible: boolean;
}

export const emptyEducationValues: EducationFormValues = {
  qualification: "",
  institution: "",
  fieldOfStudy: "",
  summary: "",
  periodLabel: "",
  startedOn: "",
  endedOn: "",
  position: 0,
  isVisible: true,
};

type EducationAction = (
  previous: ActionState<EducationMutationData>,
  formData: FormData,
) => Promise<ActionState<EducationMutationData>>;

export function EducationForm({
  action,
  entryId,
  initialValues,
  submitLabel,
}: {
  action: EducationAction;
  entryId?: string;
  initialValues: EducationFormValues;
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<EducationFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof EducationFormValues>(
    key: K,
    value: EducationFormValues[K],
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
      {entryId ? <input type="hidden" name="id" value={entryId} /> : null}

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
        aria-labelledby={`${fieldId}-study`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-study`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Study
        </h2>

        <TextField
          id={`${fieldId}-qualification`}
          name="qualification"
          label="Qualification"
          required
          value={values.qualification}
          errors={fieldErrors.qualification}
          hint="The award or programme, e.g. “BSc Computer Science”."
          onChange={(value) => update("qualification", value)}
        />

        <TextField
          id={`${fieldId}-institution`}
          name="institution"
          label="Institution"
          required
          value={values.institution}
          errors={fieldErrors.institution}
          hint="The school, college, or university."
          onChange={(value) => update("institution", value)}
        />

        <TextField
          id={`${fieldId}-field`}
          name="fieldOfStudy"
          label="Field of study"
          value={values.fieldOfStudy}
          errors={fieldErrors.fieldOfStudy}
          hint="Optional specialism, e.g. “Distributed Systems”."
          onChange={(value) => update("fieldOfStudy", value)}
        />

        <TextAreaField
          id={`${fieldId}-summary`}
          name="summary"
          label="Summary"
          rows={4}
          value={values.summary}
          errors={fieldErrors.summary}
          hint="Optional short description of the programme."
          onChange={(value) => update("summary", value)}
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

        <TextField
          id={`${fieldId}-period`}
          name="periodLabel"
          label="Period label"
          value={values.periodLabel}
          errors={fieldErrors.periodLabel}
          hint="Optional free text shown on the site, e.g. “2018 — 2022”."
          onChange={(value) => update("periodLabel", value)}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={`${fieldId}-started`}
            name="startedOn"
            label="Started on"
            type="date"
            value={values.startedOn}
            errors={fieldErrors.startedOn}
            hint="Optional. Used for sorting."
            onChange={(value) => update("startedOn", value)}
          />
          <TextField
            id={`${fieldId}-ended`}
            name="endedOn"
            label="Ended on"
            type="date"
            value={values.endedOn}
            errors={fieldErrors.endedOn}
            hint="Optional. Leave empty if there is no end date."
            onChange={(value) => update("endedOn", value)}
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
          hint="Uncheck to hide this entry from the public site. It stays listed here."
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
          href="/education"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
