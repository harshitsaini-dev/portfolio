"use client";

/**
 * Create/edit form for a page section.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth.
 *
 * ## `key` is editable on create and immutable afterwards
 *
 * It is the stable machine identifier the public UI maps to a component, so
 * renaming it would silently disconnect the section from what renders it.
 * The repository omits it from its patch allowlist and
 * `sectionUpdateSchema` rejects it outright.
 *
 * So on **create** it is a normal required text field, and on **edit** it is
 * presented as read-only context in a `<dl>` — a real definition list rather
 * than a disabled `<input>`. A disabled input still looks like a control the
 * user could enable, and a `readonly` one is focusable and copyable but
 * still reads as a form field; neither is honest about a value that simply
 * cannot change here. The edit payload omits `key` entirely.
 */

import Link from "next/link";
import { PhraseListField } from "@/components/form/phrase-list-field";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { SectionMutationData } from "@/lib/actions/sections";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface SectionFormValues {
  /** The chosen media asset id, or `""` for no icon. */
  iconMediaId: string;
  key: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  position: number;
  isVisible: boolean;
  titleAlternates: string[];
  eyebrowAlternates: string[];
}

export const emptySectionValues: SectionFormValues = {
  iconMediaId: "",
  key: "",
  title: "",
  subtitle: "",
  eyebrow: "",
  position: 0,
  isVisible: true,
  titleAlternates: [],
  eyebrowAlternates: [],
};

type SectionAction = (
  previous: ActionState<SectionMutationData>,
  formData: FormData,
) => Promise<ActionState<SectionMutationData>>;

export function SectionForm({
  action,
  sectionId,
  initialValues,
  submitLabel,
  mediaOptions,
}: {
  action: SectionAction;
  sectionId?: string;
  initialValues: SectionFormValues;
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SectionFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const isEditing = sectionId !== undefined;
  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SectionFormValues>(
    key: K,
    value: SectionFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /**
   * Serialized once, so the server parses exactly one trusted-shape blob.
   *
   * On edit, `key` is omitted entirely: the update schema is `.strict()` and
   * rejects it, which is the point — an accepted-but-ignored field would
   * look like a rename that silently did nothing.
   */
  const payload = JSON.stringify({
    ...(isEditing ? {} : { key: values.key }),
    title: values.title,
    subtitle: values.subtitle,
    iconMediaId: values.iconMediaId,
    eyebrow: values.eyebrow,
    position: Number.isFinite(values.position) ? values.position : 0,
    isVisible: values.isVisible,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {/*
        A second hidden field rather than a member of `payload`.

        `sectionCreateSchema` and `sectionUpdateSchema` are `.strict()`, so an
        unrecognised key makes the whole submission fail validation — and
        rightly: the section patch describes columns on the `sections` row,
        and these are rows in another table with their own write rule.
      */}
      <input
        type="hidden"
        name="alternates"
        value={JSON.stringify({
          title: values.titleAlternates,
          eyebrow: values.eyebrowAlternates,
        })}
      />
      {sectionId ? <input type="hidden" name="id" value={sectionId} /> : null}

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
        aria-labelledby={`${fieldId}-identity`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-identity`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Identity
        </h2>

        {isEditing ? (
          <dl className="flex flex-col gap-1.5">
            <dt className="text-sm font-medium text-fg">Key</dt>
            <dd className="font-mono text-sm text-fg-muted">{values.key}</dd>
            <dd className="text-xs text-fg-muted">
              The stable machine identifier the public site uses to map this
              section to its component. It is set when the section is created
              and cannot be changed here — renaming it would disconnect the
              section from what renders it.
            </dd>
          </dl>
        ) : (
          <TextField
            id={`${fieldId}-key`}
            name="key"
            label="Key"
            required
            value={values.key}
            errors={fieldErrors.key}
            hint="Stable machine identifier the public site maps to a component, e.g. “projects”. Lowercase letters, numbers, and single hyphens. Must be unique, and cannot be changed later."
            onChange={(value) => update("key", value)}
          />
        )}

        <TextField
          id={`${fieldId}-title`}
          name="title"
          label="Title"
          required
          value={values.title}
          errors={fieldErrors.title}
          hint="The heading shown for this section on the public site."
          onChange={(value) => update("title", value)}
        />

        <TextField
          id={`${fieldId}-eyebrow`}
          name="eyebrow"
          label="Eyebrow"
          value={values.eyebrow}
          errors={fieldErrors.eyebrow}
          hint="Optional small label rendered above the title, e.g. “What I do”."
          onChange={(value) => update("eyebrow", value)}
        />

        <TextAreaField
          id={`${fieldId}-subtitle`}
          name="subtitle"
          label="Subtitle"
          rows={3}
          value={values.subtitle}
          errors={fieldErrors.subtitle}
          hint="Optional supporting copy shown beneath the title."
          onChange={(value) => update("subtitle", value)}
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
          hint="Display order on the public site. Lower numbers appear first."
          onChange={(value) => update("position", Number(value))}
        />

        <PhraseListField
          label="Eyebrow alternatives"
          description="The small label above the heading cycles through these, in order, after the eyebrow above. The heading itself does not rotate — it is what the page is scanned by."
          phrases={values.eyebrowAlternates}
          onChange={(next) => update("eyebrowAlternates", next)}
          errors={fieldErrors}
          errorKey="alternates.eyebrow"
          placeholder="Selected work"
        />

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Uncheck to hide this section from the public site. It stays listed here."
        />
      </section>

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
          hint="Optional image shown beside this section."
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
          href="/sections"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
