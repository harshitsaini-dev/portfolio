"use client";

/**
 * Create/edit form for a skill.
 *
 * Two things are specific to this entity:
 *
 * **The category is chosen from a real list**, passed in from the server as
 * `{ id, name }` pairs. Only the id is submitted — a client-supplied category
 * *name* is never persisted, because the name lives on the category row and
 * duplicating it here would be untrusted state that can drift.
 *
 * **The category cannot be changed on edit.** `categoryId` is absent from
 * `skillUpdateSchema` and from the repository's patch allowlist, because
 * moving a skill also has to resolve its position in the destination and its
 * `UNIQUE (category_id, name)` collision there — a distinct operation rather
 * than a field write. Rather than render a control that would be rejected,
 * the edit view shows the owning category as read-only text.
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
  SelectField,
  TextField,
} from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface SkillFormValues {
  /** The chosen media asset id, or `""` for no icon. */
  iconMediaId: string;
  categoryId: string;
  name: string;
  /** Empty string means "not rated" — distinct from a rating of 1. */
  proficiency: string;
  position: number;
  isVisible: boolean;
}

export const emptySkillValues: SkillFormValues = {
  iconMediaId: "",
  categoryId: "",
  name: "",
  proficiency: "",
  position: 0,
  isVisible: true,
};

export interface SkillCategoryOption {
  id: string;
  name: string;
}

const PROFICIENCY_OPTIONS = [
  { value: "", label: "Not rated" },
  { value: "1", label: "1 — Beginner" },
  { value: "2", label: "2" },
  { value: "3", label: "3 — Intermediate" },
  { value: "4", label: "4" },
  { value: "5", label: "5 — Expert" },
] as const;

type SkillsAction = (
  previous: ActionState<SkillsMutationData>,
  formData: FormData,
) => Promise<ActionState<SkillsMutationData>>;

export function SkillForm({
  action,
  skillId,
  categories,
  categoryName,
  initialValues,
  submitLabel,
  mediaOptions,
}: {
  action: SkillsAction;
  skillId?: string;
  /** Selectable categories. Only used when creating. */
  categories: readonly SkillCategoryOption[];
  /** The owning category's name, shown read-only when editing. */
  categoryName?: string;
  initialValues: SkillFormValues;
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SkillFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const isEditing = skillId !== undefined;
  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SkillFormValues>(
    key: K,
    value: SkillFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /**
   * Serialized once, so the server parses exactly one trusted-shape blob.
   *
   * On edit, `categoryId` is omitted entirely: the update schema is
   * `.strict()` and rejects it, which is the point — an accepted-but-ignored
   * field would look like a move that silently did nothing.
   */
  const proficiency =
    values.proficiency === "" ? null : Number(values.proficiency);
  const payload = JSON.stringify({
    ...(isEditing ? {} : { categoryId: values.categoryId }),
    name: values.name,
    proficiency,
    iconMediaId: values.iconMediaId,
    position: Number.isFinite(values.position) ? values.position : 0,
    isVisible: values.isVisible,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {skillId ? <input type="hidden" name="id" value={skillId} /> : null}

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
        aria-labelledby={`${fieldId}-skill`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-skill`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Skill
        </h2>

        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">Category</span>
            <p className="text-sm text-fg-muted">
              {categoryName}{" "}
              <span className="text-xs">
                — a skill cannot be moved between categories here.
              </span>
            </p>
          </div>
        ) : (
          <SelectField
            id={`${fieldId}-category`}
            name="categoryId"
            label="Category"
            value={values.categoryId}
            errors={fieldErrors.categoryId}
            hint="The group this skill belongs to."
            options={[
              { value: "", label: "Select a category…" },
              ...categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
            onChange={(value) => update("categoryId", value)}
          />
        )}

        <TextField
          id={`${fieldId}-name`}
          name="name"
          label="Name"
          required
          value={values.name}
          errors={fieldErrors.name}
          hint="The skill itself, e.g. “TypeScript”. Must be unique within its category."
          onChange={(value) => update("name", value)}
        />

        <SelectField
          id={`${fieldId}-proficiency`}
          name="proficiency"
          label="Proficiency"
          value={values.proficiency}
          errors={fieldErrors.proficiency}
          hint="Optional 1–5 rating. “Not rated” is stored as no value, not as a low score."
          options={PROFICIENCY_OPTIONS.map((option) => ({ ...option }))}
          onChange={(value) => update("proficiency", value)}
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
          hint="Display order within the category. Lower numbers appear first."
          onChange={(value) => update("position", Number(value))}
        />

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Uncheck to hide this skill from the public site. It stays listed here."
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
          hint="Optional image shown beside this skill."
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
          href="/skills"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
