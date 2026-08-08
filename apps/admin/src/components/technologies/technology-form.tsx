"use client";

/**
 * Create/edit form for a technology.
 *
 * Same architecture as the project form, scaled to a three-field entity: no
 * form library, `useActionState` for pending state and server-returned
 * errors, the shared field primitives for labelling and ARIA wiring, and an
 * error summary that takes focus. Server-side Zod remains the source of
 * truth — nothing here is a validation boundary.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { TechnologyMutationData } from "@/lib/actions/technologies";
import { TextField } from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface TechnologyFormValues {
  name: string;
  slug: string;
  category: string;
  /** The chosen media asset id, or `""` for no icon. */
  iconMediaId: string;
}

export const emptyTechnologyValues: TechnologyFormValues = {
  name: "",
  slug: "",
  category: "",
  iconMediaId: "",
};

type TechnologyAction = (
  previous: ActionState<TechnologyMutationData>,
  formData: FormData,
) => Promise<ActionState<TechnologyMutationData>>;

/**
 * Suggest a slug from a name.
 *
 * Intentionally the same rules as `suggestSlug` in `@portfolio/schemas`, but
 * technologies are frequently punctuated in ways a title is not — "Node.js",
 * "C++", ".NET" — and this only ever *suggests*. Whatever the user submits
 * is what gets validated and stored.
 */
function suggestTechnologySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
}

export function TechnologyForm({
  action,
  technologyId,
  initialValues,
  submitLabel,
  mediaOptions,
}: {
  action: TechnologyAction;
  technologyId?: string;
  initialValues: TechnologyFormValues;
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<TechnologyFormValues>(initialValues);
  // Auto-slug only until the user edits the slug themselves; after that the
  // typed value is never silently overwritten.
  const [slugTouched, setSlugTouched] = useState(initialValues.slug.length > 0);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof TechnologyFormValues>(
    key: K,
    value: TechnologyFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify({
    name: values.name,
    slug: values.slug,
    category: values.category,
    iconMediaId: values.iconMediaId,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-8">
      <input type="hidden" name="payload" value={payload} />
      {technologyId ? (
        <input type="hidden" name="id" value={technologyId} />
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
        aria-labelledby={`${fieldId}-details`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-details`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Details
        </h2>

        <TextField
          id={`${fieldId}-name`}
          name="name"
          label="Name"
          required
          value={values.name}
          errors={fieldErrors.name}
          hint="How the technology is displayed, e.g. “TypeScript”."
          onChange={(value) => {
            update("name", value);
            if (!slugTouched) update("slug", suggestTechnologySlug(value));
          }}
        />

        <TextField
          id={`${fieldId}-slug`}
          name="slug"
          label="Slug"
          required
          value={values.slug}
          errors={fieldErrors.slug}
          hint="Lowercase, hyphen-separated, and unique across technologies."
          onChange={(value) => {
            setSlugTouched(true);
            update("slug", value);
          }}
        />

        <TextField
          id={`${fieldId}-category`}
          name="category"
          label="Category"
          value={values.category}
          errors={fieldErrors.category}
          hint="Optional grouping, e.g. “Language”, “Framework”, “Infrastructure”."
          onChange={(value) => update("category", value)}
        />

        <MediaPickerField
          id={`${fieldId}-icon`}
          label="Icon"
          value={values.iconMediaId}
          options={mediaOptions}
          errors={fieldErrors.iconMediaId}
          hint="Optional logo shown beside this technology."
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
          href="/technologies"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
