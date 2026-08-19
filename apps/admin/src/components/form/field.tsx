"use client";

/**
 * Form field primitives.
 *
 * Small and deliberate rather than a form framework. Each field wires up
 * the three things that are easy to get wrong and invisible when missed:
 *
 *   * a real `<label htmlFor>` — never a placeholder standing in for one;
 *   * `aria-describedby` pointing at the error, so screen readers announce
 *     it when focus enters the input;
 *   * `aria-invalid`, so the error state is conveyed by more than colour.
 */

import type { ReactNode } from "react";

const controlBase =
  "w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg transition-colors duration-150 placeholder:text-fg-muted/60";

function controlClasses(hasError: boolean): string {
  return `${controlBase} ${hasError ? "border-danger" : "border-strong"}`;
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
    className: string;
  }) => ReactNode;
}

export function Field({
  id,
  label,
  hint,
  errors,
  required,
  children,
}: FieldShellProps) {
  const hasError = Boolean(errors && errors.length > 0);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <>
            {" "}
            <span aria-hidden="true" className="text-danger">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        describedBy,
        invalid: hasError,
        className: controlClasses(hasError),
      })}
      {hasError ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {errors?.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function TextField(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  errors?: string[];
  required?: boolean;
  /**
   * The input type.
   *
   * A closed union rather than the full HTML set: these are the ones the CMS
   * actually needs, and leaving it open invites `type="email"` or
   * `type="password"`, whose browser-side behaviour would quietly become a
   * second validation layer competing with the Zod schema on the server.
   *
   * `tel` earns its place by asking a phone for the dialling keypad. It
   * deliberately performs no validation of its own — no browser does for this
   * type — which is exactly why it is safe to add.
   */
  type?: "text" | "url" | "date" | "number" | "tel";
  placeholder?: string;
  min?: number;
}) {
  return (
    <Field
      id={props.id}
      label={props.label}
      hint={props.hint}
      errors={props.errors}
      required={props.required}
    >
      {({ id, describedBy, invalid, className }) => (
        <input
          id={id}
          name={props.name}
          type={props.type ?? "text"}
          value={props.value}
          min={props.min}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={className}
        />
      )}
    </Field>
  );
}

export function TextAreaField(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  errors?: string[];
  required?: boolean;
  rows?: number;
}) {
  return (
    <Field
      id={props.id}
      label={props.label}
      hint={props.hint}
      errors={props.errors}
      required={props.required}
    >
      {({ id, describedBy, invalid, className }) => (
        <textarea
          id={id}
          name={props.name}
          rows={props.rows ?? 4}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={className}
        />
      )}
    </Field>
  );
}

export function SelectField(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string;
  errors?: string[];
}) {
  return (
    <Field id={props.id} label={props.label} hint={props.hint} errors={props.errors}>
      {({ id, describedBy, invalid, className }) => (
        <select
          id={id}
          name={props.name}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={className}
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField(props: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={props.id}
        name={props.name}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-strong"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={props.id} className="text-sm font-medium text-fg">
          {props.label}
        </label>
        {props.hint ? (
          <p className="text-xs text-fg-muted">{props.hint}</p>
        ) : null}
      </div>
    </div>
  );
}
