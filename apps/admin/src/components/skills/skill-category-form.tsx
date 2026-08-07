"use client";

/**
 * Create/edit form for a skill category.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { SkillsMutationData } from "@/lib/actions/skills";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/components/form/field";

export interface SkillCategoryFormValues {
  name: string;
  slug: string;
  description: string;
  position: number;
  isVisible: boolean;
}

export const emptySkillCategoryValues: SkillCategoryFormValues = {
  name: "",
  slug: "",
  description: "",
  position: 0,
  isVisible: true,
};

type SkillsAction = (
  previous: ActionState<SkillsMutationData>,
  formData: FormData,
) => Promise<ActionState<SkillsMutationData>>;

export function SkillCategoryForm({
  action,
  categoryId,
  initialValues,
  submitLabel,
}: {
  action: SkillsAction;
  categoryId?: string;
  initialValues: SkillCategoryFormValues;
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SkillCategoryFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SkillCategoryFormValues>(
    key: K,
    value: SkillCategoryFormValues[K],
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
      {categoryId ? (
        <input type="hidden" name="id" value={categoryId} />
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
        aria-labelledby={`${fieldId}-category`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-category`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Category
        </h2>

        <TextField
          id={`${fieldId}-name`}
          name="name"
          label="Name"
          required
          value={values.name}
          errors={fieldErrors.name}
          hint="How the group is shown, e.g. “Languages”."
          onChange={(value) => update("name", value)}
        />

        <TextField
          id={`${fieldId}-slug`}
          name="slug"
          label="Slug"
          required
          value={values.slug}
          errors={fieldErrors.slug}
          hint="Lowercase letters, numbers, and single hyphens. Must be unique."
          onChange={(value) => update("slug", value)}
        />

        <TextAreaField
          id={`${fieldId}-description`}
          name="description"
          label="Description"
          rows={3}
          value={values.description}
          errors={fieldErrors.description}
          hint="Optional short explanation of what belongs in this category."
          onChange={(value) => update("description", value)}
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
          hint="Display order. Lower numbers appear first."
          onChange={(value) => update("position", Number(value))}
        />

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Uncheck to hide this category from the public site. It stays listed here."
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
          href="/skills/categories"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
