"use client";

/**
 * Create/edit form for a timeline entry and its owned highlights.
 *
 * The established architecture: no form library, `useActionState` for
 * pending state and server-returned errors, the shared field primitives for
 * labelling and ARIA wiring, and an error summary that takes focus. Server
 * -side Zod remains the source of truth.
 *
 * Highlights are edited inline rather than on their own screen, because
 * they are owned by the entry and are saved with it in one aggregate write.
 * Ordering is expressed as **array order** and submitted explicitly — the
 * server assigns `position` from the index, so nothing depends on DOM order.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { TimelineMutationData } from "@/lib/actions/timeline";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface TimelineFormValues {
  /** The chosen media asset id, or `""` for no icon. */
  iconMediaId: string;
  role: string;
  organization: string;
  summary: string;
  location: string;
  periodLabel: string;
  startedOn: string;
  endedOn: string;
  position: number;
  isVisible: boolean;
  highlights: string[];
}

export const emptyTimelineValues: TimelineFormValues = {
  iconMediaId: "",
  role: "",
  organization: "",
  summary: "",
  location: "",
  periodLabel: "",
  startedOn: "",
  endedOn: "",
  position: 0,
  isVisible: true,
  highlights: [],
};

type TimelineAction = (
  previous: ActionState<TimelineMutationData>,
  formData: FormData,
) => Promise<ActionState<TimelineMutationData>>;

export function TimelineForm({
  action,
  entryId,
  initialValues,
  submitLabel,
  mediaOptions,
}: {
  action: TimelineAction;
  entryId?: string;
  initialValues: TimelineFormValues;
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<TimelineFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof TimelineFormValues>(
    key: K,
    value: TimelineFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify({
    role: values.role,
    organization: values.organization,
    iconMediaId: values.iconMediaId,
    summary: values.summary,
    location: values.location,
    periodLabel: values.periodLabel,
    startedOn: values.startedOn,
    endedOn: values.endedOn,
    position: Number.isFinite(values.position) ? values.position : 0,
    isVisible: values.isVisible,
    // Array order *is* the ordering. `position` is never sent; the server
    // assigns it from the index.
    highlights: values.highlights.map((content) => ({ content })),
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

      <section aria-labelledby={`${fieldId}-role`} className="flex flex-col gap-5">
        <h2
          id={`${fieldId}-role`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Role
        </h2>

        <TextField
          id={`${fieldId}-role-field`}
          name="role"
          label="Role"
          required
          value={values.role}
          errors={fieldErrors.role}
          hint="Your job title, e.g. “Senior Software Engineer”."
          onChange={(value) => update("role", value)}
        />

        <TextField
          id={`${fieldId}-organization`}
          name="organization"
          label="Organization"
          required
          value={values.organization}
          errors={fieldErrors.organization}
          hint="The employer or client."
          onChange={(value) => update("organization", value)}
        />

        <TextAreaField
          id={`${fieldId}-summary`}
          name="summary"
          label="Summary"
          rows={4}
          value={values.summary}
          errors={fieldErrors.summary}
          hint="Optional short description of the role."
          onChange={(value) => update("summary", value)}
        />

        <TextField
          id={`${fieldId}-location`}
          name="location"
          label="Location"
          value={values.location}
          errors={fieldErrors.location}
          hint="Optional, e.g. “Remote” or a city."
          onChange={(value) => update("location", value)}
        />
      </section>

      <section aria-labelledby={`${fieldId}-dates`} className="flex flex-col gap-5">
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
          hint="Optional free text shown on the site, e.g. “2024 — Present”."
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
            hint="Used for sorting."
            onChange={(value) => update("startedOn", value)}
          />
          <TextField
            id={`${fieldId}-ended`}
            name="endedOn"
            label="Ended on"
            type="date"
            value={values.endedOn}
            errors={fieldErrors.endedOn}
            hint="Leave empty if this is your current role."
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
          hint="Uncheck to hide this entry from the public site."
        />
      </section>

      <HighlightsSection
        idPrefix={fieldId}
        highlights={values.highlights}
        errors={fieldErrors}
        onChange={(highlights) => update("highlights", highlights)}
      />

      <section
        aria-labelledby={`${fieldId}-icon-heading`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-icon-heading`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Icon
        </h2>

        <MediaPickerField
          id={`${fieldId}-icon`}
          label="Icon"
          value={values.iconMediaId}
          options={mediaOptions}
          errors={fieldErrors.iconMediaId}
          hint="Optional image shown beside this entry."
          onChange={(value) => update("iconMediaId", value)}
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
          href="/timeline"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/**
 * The highlight editor.
 *
 * Reordering is **move up / move down buttons**, not drag-and-drop. The
 * design system has no accessible drag implementation, and a
 * pointer-only reorder would leave keyboard users unable to achieve the same
 * result — so the accessible control is the only control, rather than a
 * fallback bolted onto one that excludes people.
 *
 * Each row announces its own position, and the buttons name the bullet they
 * move, so the list is usable without seeing it.
 */
function HighlightsSection({
  idPrefix,
  highlights,
  errors,
  onChange,
}: {
  idPrefix: string;
  highlights: string[];
  errors: Record<string, string[]>;
  onChange: (highlights: string[]) => void;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState("");

  function move(from: number, to: number) {
    if (to < 0 || to >= highlights.length) return;
    const next = [...highlights];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setStatus(`Highlight moved to position ${to + 1} of ${next.length}.`);
  }

  const listError = errors.highlights;

  return (
    <section
      aria-labelledby={`${idPrefix}-highlights`}
      className="flex flex-col gap-3"
    >
      <h2
        id={`${idPrefix}-highlights`}
        className="text-sm font-semibold uppercase tracking-wider text-fg"
      >
        Highlights
      </h2>
      <p className="text-xs text-fg-muted">
        Bullet points for this role. They are saved with the entry, in the
        order shown.
      </p>

      {listError?.length ? (
        <p className="text-xs font-medium text-danger">{listError.join(" ")}</p>
      ) : null}

      {highlights.length === 0 ? (
        <p className="text-sm text-fg-muted">No highlights yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {highlights.map((content, index) => {
            const inputId = `${idPrefix}-highlight-${index}`;
            const rowErrors = errors[`highlights.${index}.content`];
            return (
              <li
                key={index}
                className="rounded-lg border border-subtle bg-surface p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <label
                      htmlFor={inputId}
                      className="text-sm font-medium text-fg"
                    >
                      Highlight {index + 1}
                    </label>
                    <textarea
                      id={inputId}
                      rows={2}
                      value={content}
                      onChange={(event) => {
                        const next = [...highlights];
                        next[index] = event.target.value;
                        onChange(next);
                      }}
                      aria-invalid={rowErrors?.length ? true : undefined}
                      aria-describedby={
                        rowErrors?.length ? `${inputId}-error` : undefined
                      }
                      className={`mt-1.5 w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg ${
                        rowErrors?.length ? "border-danger" : "border-strong"
                      }`}
                    />
                    {rowErrors?.length ? (
                      <p
                        id={`${inputId}-error`}
                        className="mt-1 text-xs font-medium text-danger"
                      >
                        {rowErrors.join(" ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-strong bg-surface text-sm text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span aria-hidden="true">↑</span>
                      <span className="sr-only">
                        Move highlight {index + 1} up
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === highlights.length - 1}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-strong bg-surface text-sm text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span aria-hidden="true">↓</span>
                      <span className="sr-only">
                        Move highlight {index + 1} down
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(highlights.filter((_, i) => i !== index));
                        setStatus(`Highlight ${index + 1} removed.`);
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger px-3 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Remove
                      <span className="sr-only"> highlight {index + 1}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div>
        <button
          type="button"
          onClick={() => {
            onChange([...highlights, ""]);
            setStatus(`Highlight ${highlights.length + 1} added.`);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Add highlight
        </button>
      </div>

      {/* Reordering and removal are visual changes a screen-reader user would
          otherwise have to discover by re-reading the list. */}
      <p ref={statusRef} role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </section>
  );
}
