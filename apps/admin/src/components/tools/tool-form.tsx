"use client";

/**
 * Create/edit form for a tool.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth — the `type="url"` input is a
 * keyboard/UX affordance, never the validation.
 *
 * Tools own no child rows, so this is the plainest CMS form in the admin.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { ToolMutationData } from "@/lib/actions/tools";
import {
  CheckboxField,
  TextField,
} from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface ToolFormValues {
  /** The chosen media asset id, or `""` for no icon. */
  iconMediaId: string;
  name: string;
  purpose: string;
  url: string;
  position: number;
  isVisible: boolean;
}

export const emptyToolValues: ToolFormValues = {
  iconMediaId: "",
  name: "",
  purpose: "",
  url: "",
  position: 0,
  isVisible: true,
};

type ToolAction = (
  previous: ActionState<ToolMutationData>,
  formData: FormData,
) => Promise<ActionState<ToolMutationData>>;

export function ToolForm({
  action,
  toolId,
  initialValues,
  submitLabel,
  mediaOptions,
}: {
  action: ToolAction;
  toolId?: string;
  initialValues: ToolFormValues;
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<ToolFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof ToolFormValues>(
    key: K,
    value: ToolFormValues[K],
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
      {toolId ? <input type="hidden" name="id" value={toolId} /> : null}

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
        aria-labelledby={`${fieldId}-tool`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-tool`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Tool
        </h2>

        <TextField
          id={`${fieldId}-name`}
          name="name"
          label="Name"
          required
          value={values.name}
          errors={fieldErrors.name}
          hint="The tool’s name, e.g. “Figma”. Must be unique."
          onChange={(value) => update("name", value)}
        />

        <TextField
          id={`${fieldId}-purpose`}
          name="purpose"
          label="Purpose"
          value={values.purpose}
          errors={fieldErrors.purpose}
          hint="Optional short description of what it is used for."
          onChange={(value) => update("purpose", value)}
        />

        <TextField
          id={`${fieldId}-url`}
          name="url"
          label="URL"
          type="url"
          value={values.url}
          errors={fieldErrors.url}
          hint="Optional link to the tool. Must start with http:// or https://."
          onChange={(value) => update("url", value)}
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
          hint="Uncheck to hide this tool from the public site. It stays listed here."
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
          hint="Optional image shown beside this tool."
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
          href="/tools"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
