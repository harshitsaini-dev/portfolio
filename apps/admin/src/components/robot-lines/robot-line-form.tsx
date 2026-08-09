"use client";

/**
 * Create/edit form for one of the robot's lines.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth.
 *
 * The plainest form in the admin — one sentence, an order and a visibility
 * flag — so it also carries the guidance an editor needs that the fields
 * themselves cannot express.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { RobotLineMutationData } from "@/lib/actions/robot-lines";
import { CheckboxField, TextField } from "@/components/form/field";

export interface RobotLineFormValues {
  text: string;
  position: number;
  isVisible: boolean;
}

export const emptyRobotLineValues: RobotLineFormValues = {
  text: "",
  position: 0,
  isVisible: true,
};

type RobotLineAction = (
  previous: ActionState<RobotLineMutationData>,
  formData: FormData,
) => Promise<ActionState<RobotLineMutationData>>;

export function RobotLineForm({
  action,
  lineId,
  initialValues,
  submitLabel,
}: {
  action: RobotLineAction;
  lineId?: string;
  initialValues: RobotLineFormValues;
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<RobotLineFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof RobotLineFormValues>(
    key: K,
    value: RobotLineFormValues[K],
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
      {lineId ? <input type="hidden" name="id" value={lineId} /> : null}

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
              Could not save
            </strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      <section
        aria-labelledby={`${fieldId}-line`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-line`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Line
        </h2>

        <TextField
          id={`${fieldId}-text`}
          name="text"
          label="Text"
          required
          value={values.text}
          errors={fieldErrors.text}
          hint="One short sentence. Emoji are fine. Keep it under about 160 characters — the bubble is roughly one sentence wide, and longer text either overflows it or covers the page behind."
          onChange={(value) => update("text", value)}
        />

        {/*
          Two things an editor cannot see from the field itself, and both
          change what they should write.
        */}
        <p className="text-sm text-fg-muted">
          The bubble is decorative and hidden from screen readers, so nothing
          here is announced — write for the eye. Lines are picked at random, so
          they should each stand on their own rather than following on from one
          another.
        </p>
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
          hint="Sets the order in this list. It does not affect which line is shown — one is picked at random each time."
          onChange={(value) => update("position", Number(value))}
        />

        <CheckboxField
          id={`${fieldId}-visible`}
          name="isVisible"
          label="Visible"
          checked={values.isVisible}
          onChange={(checked) => update("isVisible", checked)}
          hint="Uncheck to stop the robot saying this. It stays listed here."
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
          href="/robot-lines"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
