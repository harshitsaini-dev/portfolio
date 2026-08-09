"use client";

/**
 * Create/edit form for a résumé record.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth.
 *
 * ## There is no "current" checkbox here
 *
 * At most one résumé may be current, enforced by a partial unique index. A
 * checkbox would imply it is an ordinary field an editor can tick on two rows,
 * and the second save would fail on a constraint. Publishing is a separate
 * button on the list, backed by a repository call that clears the others in
 * the same batch.
 *
 * ## The picker offers documents, not images
 *
 * A résumé is its file, and the public download route serves whatever the row
 * points at — so offering images here would let somebody publish a screenshot
 * as a résumé. The filter lives in `getDocumentOptions`, beside the intent.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { ResumeMutationData } from "@/lib/actions/resumes";
import { CheckboxField, TextField } from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface ResumeFormValues {
  label: string;
  /** The chosen PDF's media asset id. Required — a résumé is its file. */
  mediaAssetId: string;
  isVisible: boolean;
}

export const emptyResumeValues: ResumeFormValues = {
  label: "",
  mediaAssetId: "",
  isVisible: true,
};

type ResumeAction = (
  previous: ActionState<ResumeMutationData>,
  formData: FormData,
) => Promise<ActionState<ResumeMutationData>>;

export function ResumeForm({
  action,
  resumeId,
  initialValues,
  submitLabel,
  documentOptions,
}: {
  action: ResumeAction;
  resumeId?: string;
  initialValues: ResumeFormValues;
  submitLabel: string;
  /** Uploaded PDFs to choose from, read on the server by the page. */
  documentOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<ResumeFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof ResumeFormValues>(
    key: K,
    value: ResumeFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify(values);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {resumeId ? <input type="hidden" name="id" value={resumeId} /> : null}

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
              Could not save
            </strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      <section
        aria-labelledby={`${fieldId}-resume`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-resume`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Résumé
        </h2>

        <TextField
          id={`${fieldId}-label`}
          name="label"
          label="Label"
          required
          value={values.label}
          errors={fieldErrors.label}
          hint="The download link’s text on the public site, e.g. “Download CV”."
          onChange={(value) => update("label", value)}
        />

        {documentOptions.length === 0 ? (
          // Said plainly rather than shown as an empty dropdown: without a
          // PDF in the library there is nothing to attach, and the reason is
          // not something an editor can deduce from a picker with no options.
          <p className="rounded-md border border-subtle bg-surface-muted p-4 text-sm text-fg-muted">
            No PDFs have been uploaded yet. Upload one in{" "}
            <Link
              href="/media/new"
              className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
            >
              Media
            </Link>{" "}
            first — a résumé is its file, so there is nothing to attach until
            then.
          </p>
        ) : (
          <MediaPickerField
            id={`${fieldId}-asset`}
            label="PDF"
            value={values.mediaAssetId}
            options={documentOptions}
            errors={fieldErrors.mediaAssetId}
            emptyLabel="No file"
            hint="The uploaded PDF this résumé serves. Only documents are listed."
            onChange={(value) => update("mediaAssetId", value)}
          />
        )}

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Unticking hides the download even while this is the current résumé. The public site checks both."
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
          href="/resumes"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
