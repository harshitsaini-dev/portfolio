"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";

import { createResumeAction } from "@/lib/actions/resumes";
import { idleState, isErrorResult } from "@/lib/actions/result";
import { CheckboxField, TextField } from "@/components/form/field";

export function ResumeUploadForm() {
  const formId = useId();
  const [state, action, isPending] = useActionState(
    createResumeAction,
    idleState,
  );
  const summaryRef = useRef<HTMLDivElement>(null);

  const [label, setLabel] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};

  return (
    <form action={action} className="mt-8 space-y-6 max-w-xl">
      {isErrorResult(state) && (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          aria-labelledby={`${formId}-error-heading`}
          className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
        >
          <h2 id={`${formId}-error-heading`} className="font-semibold">
            {state.message}
          </h2>
        </div>
      )}

      <TextField
        id={`${formId}-label`}
        name="label"
        label="Résumé Label"
        placeholder="e.g. Lead Full-Stack Engineer Resume (2026)"
        required
        value={label}
        onChange={setLabel}
        errors={fieldErrors.label}
        hint="A descriptive title to distinguish this version in the CMS."
      />

      <div className="space-y-1.5">
        <label
          htmlFor={`${formId}-file`}
          className="block text-sm font-medium text-fg"
        >
          PDF File <span className="text-danger">*</span>
        </label>
        <input
          id={`${formId}-file`}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-sm text-fg file:mr-4 file:rounded-md file:border-0 file:bg-surface-muted file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-strong focus:outline-none"
        />
        <p className="text-xs text-fg-muted">
          PDF documents up to 10 MB. Only valid PDF files with binary signatures are accepted.
        </p>
      </div>

      <div className="space-y-3 pt-2">
        <input type="hidden" name="isCurrent" value={isCurrent ? "true" : "false"} />
        <CheckboxField
          id={`${formId}-isCurrent`}
          name="isCurrent"
          label="Set as current active résumé"
          checked={isCurrent}
          onChange={setIsCurrent}
          hint="Directs public /resume links to this version."
        />

        <input type="hidden" name="isVisible" value={isVisible ? "true" : "false"} />
        <CheckboxField
          id={`${formId}-isVisible`}
          name="isVisible"
          label="Visible on public portfolio"
          checked={isVisible}
          onChange={setIsVisible}
        />
      </div>

      <div className="flex items-center gap-4 pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:opacity-50"
        >
          {isPending ? "Uploading résumé..." : "Upload and Save Résumé"}
        </button>
        <Link
          href="/resumes"
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
