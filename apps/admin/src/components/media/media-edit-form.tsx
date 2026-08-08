"use client";

/**
 * Edit the one field a stored asset actually has: its alt text.
 *
 * `storage_key`, `content_type` and `byte_size` describe the object that was
 * stored, so they are shown as read-only context in a `<dl>` rather than as
 * disabled inputs. A disabled input still reads as a control someone might
 * enable; a definition list says "this is information about the record",
 * which is what it is. Same stance the sections form takes for its machine
 * key. The repository's patch allowlist and the update schema both refuse
 * them regardless.
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

type MediaAction = (
  previous: ActionState<MediaMutationData>,
  formData: FormData,
) => Promise<ActionState<MediaMutationData>>;

export function MediaEditForm({
  action,
  assetId,
  contentType,
  byteSize,
  initialAltText,
}: {
  action: MediaAction;
  assetId: string;
  contentType: string;
  byteSize: number;
  initialAltText: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [altText, setAltText] = useState(initialAltText);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;
  const isImage = contentType.startsWith("image/");

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="id" value={assetId} />

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
        aria-labelledby={`${fieldId}-stored`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-stored`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Stored file
        </h2>
        <dl className="grid grid-cols-1 gap-3 rounded-md border border-subtle bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">Type</dt>
            <dd className="mt-1 text-fg">{contentType}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Size</dt>
            <dd className="mt-1 text-fg">{byteSize.toLocaleString()} bytes</dd>
          </div>
        </dl>
        <p className="text-xs text-fg-muted">
          The file itself cannot be changed here. Uploading a replacement
          creates a new file, so anything already pointing at this one keeps
          working.
        </p>
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
          {isPending ? "Saving…" : "Save changes"}
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
