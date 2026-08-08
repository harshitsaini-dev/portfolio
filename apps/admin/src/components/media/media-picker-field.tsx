"use client";

/**
 * Chooses an already-uploaded media asset for an entity's icon.
 *
 * One component for every entity that gained an `icon_media_id` in migrations
 * 0002/0003, plus `projects.cover_media_id`. Written once so eleven forms
 * cannot drift on what "no icon" submits or on how the preview is labelled.
 *
 * ## A `<select>`, not a gallery or a drag-and-drop grid
 *
 * A native select is keyboard operable, screen-reader complete, and works
 * with the browser's own type-ahead, for free. A custom listbox would have to
 * re-implement all three and would be the third-largest component in the
 * admin. The preview beside it supplies the one thing a select cannot: what
 * the chosen file actually looks like.
 *
 * ## It does not upload
 *
 * Uploading is its own flow, with its own byte sniffing, size limits and
 * failure handling — `/media/new`. Embedding a second upload path here would
 * mean a second place that can write to the bucket, and the media service
 * exists so there is exactly one. The link opens in a new tab so a
 * half-filled form is not lost.
 *
 * ## Empty string is the "no icon" value
 *
 * The placeholder option submits `""`, which `mediaReferenceSchema`
 * normalises to `null`. Submitting the literal string "null", or omitting the
 * key, would each need special-casing somewhere; an empty option value is
 * what an unset select already sends.
 */

import Link from "next/link";

import { MediaThumbnail } from "./media-thumbnail";

export interface MediaOption {
  readonly id: string;
  readonly contentType: string;
  readonly altText: string | null;
  readonly byteSize: number;
}

/** Human-readable size, matching the media list's formatting. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What the editor reads in the dropdown.
 *
 * Alt text is the only human-authored description a media asset has — the
 * schema stores no original filename — so it is the label whenever there is
 * one. Falling back to the type and size beats falling back to a UUID, which
 * identifies the row to the database and to nobody else.
 */
function optionLabel(option: MediaOption): string {
  if (option.altText) return option.altText;
  return `Untitled ${option.contentType} · ${formatBytes(option.byteSize)}`;
}

export function MediaPickerField({
  id,
  label,
  value,
  options,
  onChange,
  errors,
  hint,
}: {
  id: string;
  label: string;
  /** The selected asset id, or `""` for none. */
  value: string;
  options: readonly MediaOption[];
  onChange: (value: string) => void;
  errors?: readonly string[];
  hint?: string;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(errors && errors.length > 0);
  const selected = options.find((option) => option.id === value) ?? null;

  const describedBy =
    [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}

      <div className="flex items-start gap-3">
        {/* The preview is decorative: the select beside it already announces
            the same description as the option's label. */}
        {selected ? (
          <MediaThumbnail
            id={selected.id}
            contentType={selected.contentType}
            alt=""
            size="md"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-strong bg-surface-muted text-xs text-fg-muted"
          >
            None
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <select
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={hasError || undefined}
            className={`min-h-11 w-full rounded-md border bg-surface px-3 text-sm text-fg ${
              hasError ? "border-danger" : "border-strong"
            }`}
          >
            <option value="">No image</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {optionLabel(option)}
              </option>
            ))}
          </select>

          {options.length === 0 ? (
            <p className="text-xs text-fg-muted">
              Nothing uploaded yet.{" "}
              <Link
                href="/media/new"
                target="_blank"
                className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
              >
                Upload a file
              </Link>{" "}
              first, then choose it here.
            </p>
          ) : (
            <p className="text-xs text-fg-muted">
              Chosen from uploaded media.{" "}
              <Link
                href="/media/new"
                target="_blank"
                className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
              >
                Upload another
              </Link>
              <span className="sr-only"> (opens in a new tab)</span>.
            </p>
          )}
        </div>
      </div>

      {hasError ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {errors?.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
