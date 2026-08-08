"use client";

/**
 * Upload form for a media asset.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 *
 * ## Why this one does NOT serialize a JSON payload
 *
 * Every other form in this app posts a single `payload` blob. This one posts
 * the `FormData` directly, because it carries a `File` — and a file cannot be
 * JSON-serialized without base64-inflating it by a third and buffering it
 * twice in the browser. Server-side validation is unchanged in strength: the
 * action re-reads the bytes and the shared policy sniffs them.
 *
 * ## The `accept` attribute is a convenience, not a control
 *
 * It filters the file picker so the common case is pleasant. It is trivially
 * bypassed and the server never consults it — `evaluateUpload()` decides from
 * the actual bytes. Same for the size hint below.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { MediaMutationData } from "@/lib/actions/media";
import { TextField } from "@/components/form/field";

type UploadAction = (
  previous: ActionState<MediaMutationData>,
  formData: FormData,
) => Promise<ActionState<MediaMutationData>>;

/** Mirrors the server allowlist. A hint for the picker, never a check. */
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

export function MediaUploadForm({ action }: { action: UploadAction }) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(true);
  const [altText, setAltText] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      {/* Portfolio images. Résumés get their own screen in a later slice, so
          this form does not offer a namespace choice the editor could get
          wrong. */}
      <input type="hidden" name="purpose" value="media" />

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

      <section
        aria-labelledby={`${fieldId}-file`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-file`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          File
        </h2>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${fieldId}-input`}
            className="text-sm font-medium text-fg"
          >
            Image or PDF
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
          </label>
          <input
            id={`${fieldId}-input`}
            name="file"
            type="file"
            required
            accept={ACCEPT}
            aria-describedby={`${fieldId}-hint`}
            aria-invalid={fieldErrors.file ? true : undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setFileName(file?.name ?? null);
              setIsImage(file ? file.type.startsWith("image/") : true);
            }}
            className="block w-full rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-fg file:mr-4 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p id={`${fieldId}-hint`} className="text-xs text-fg-muted">
            PNG, JPEG or WebP up to 5 MB, or a PDF up to 10 MB. The file&rsquo;s
            contents are checked on the server, not its name.
          </p>
          {fieldErrors.file ? (
            <p role="alert" className="text-sm text-danger">
              {fieldErrors.file.join(" ")}
            </p>
          ) : null}
          {fileName ? (
            <p className="text-xs text-fg-muted">
              Selected: <span className="text-fg">{fileName}</span>
            </p>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby={`${fieldId}-describe`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-describe`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Description
        </h2>
        <TextField
          id={`${fieldId}-alt`}
          name="altText"
          label="Alt text"
          value={altText}
          onChange={setAltText}
          required={isImage}
          errors={fieldErrors.altText}
          hint={
            isImage
              ? "Describe the image for someone who cannot see it. Required for images."
              : "Optional for documents."
          }
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Uploading…" : "Upload file"}
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
