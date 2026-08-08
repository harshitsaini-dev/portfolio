"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { uploadMediaAssetAction } from "@/lib/actions/media";
import {
  idleState,
  isErrorResult,
} from "@/lib/actions/result";
import { SelectField, TextAreaField } from "@/components/form/field";

export function MediaUploadForm() {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(uploadMediaAssetAction, idleState);
  const [purpose, setPurpose] = useState<"media" | "resumes">("media");
  const [altText, setAltText] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-8 max-w-2xl">
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
              {state.status === "conflict" ? "Conflict" : "Could not upload"}
            </strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      <section className="flex flex-col gap-6">
        <SelectField
          id={`${fieldId}-purpose`}
          name="purpose"
          label="Purpose / Classification"
          value={purpose}
          options={[
            { value: "media", label: "Portfolio Media (Publicly addressable by key)" },
            { value: "resumes", label: "Résumé / CV Document (Served via stable route)" },
          ]}
          onChange={(val) => setPurpose(val as "media" | "resumes")}
          hint="Determines storage namespace and public delivery boundary."
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${fieldId}-file`} className="text-sm font-medium text-fg">
            File <span className="text-danger">*</span>
          </label>
          <p id={`${fieldId}-file-hint`} className="text-xs text-fg-muted">
            Accepted types: PNG, JPEG, WebP (max 5 MB) or PDF (max 10 MB). SVG is excluded.
          </p>
          <input
            id={`${fieldId}-file`}
            name="file"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp,application/pdf"
            aria-describedby={`${fieldId}-file-hint`}
            className="w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg transition-colors duration-150 file:mr-4 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-xs file:font-medium file:text-fg hover:file:bg-surface-muted/80"
          />
          {fieldErrors.file ? (
            <p className="text-xs font-medium text-danger">{fieldErrors.file.join(" ")}</p>
          ) : null}
        </div>

        <TextAreaField
          id={`${fieldId}-altText`}
          name="altText"
          label="Alt Text / Description"
          rows={3}
          value={altText}
          required={purpose === "media"}
          errors={fieldErrors.altText}
          hint="Required for images to describe the visual content for screen readers. Optional for PDF documents."
          onChange={setAltText}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Uploading…" : "Upload to R2"}
        </button>
        <Link
          href="/media"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
