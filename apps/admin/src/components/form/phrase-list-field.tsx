"use client";

/**
 * An ordered list of short phrases, edited in place.
 *
 * Built for the rotating labels — a headline's alternatives, a section's — and
 * kept generic because those are three lists with identical rules, and a third
 * near-copy of the timeline's highlight editor would have been the moment to
 * stop copying.
 *
 * ## Reordering is buttons, not drag-and-drop
 *
 * The same decision the highlight editor made, for the same reason: the design
 * system has no accessible drag implementation, and a pointer-only reorder
 * leaves keyboard users unable to achieve the result at all. The accessible
 * control is the only control rather than a fallback bolted onto one that
 * excludes people. Each row announces its position and each button names the
 * phrase it moves, so the list is operable without seeing it.
 *
 * ## Order is meaning here
 *
 * These lists rotate in the order shown, after the canonical label the form
 * already has a field for. That is why the empty state says so rather than
 * just saying the list is empty: an editor who does not know the primary
 * phrase comes first will add it twice.
 */

import { useId, useState } from "react";

export function PhraseListField({
  label,
  description,
  phrases,
  onChange,
  errors,
  errorKey,
  max = 8,
  placeholder,
}: {
  label: string;
  description: string;
  phrases: string[];
  onChange: (phrases: string[]) => void;
  errors: Record<string, string[]>;
  /** Field name the server reports errors under, e.g. `headlineAlternates`. */
  errorKey: string;
  max?: number;
  placeholder?: string;
}) {
  const idPrefix = useId();
  // A polite announcement for reordering and removal, which otherwise happen
  // silently for anyone not watching the list.
  const [status, setStatus] = useState("");

  const listErrors = errors[errorKey];

  function move(from: number, to: number) {
    if (to < 0 || to >= phrases.length) return;
    const next = [...phrases];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
    setStatus(`Moved to position ${to + 1} of ${next.length}.`);
  }

  function remove(index: number) {
    const next = phrases.filter((_, i) => i !== index);
    onChange(next);
    setStatus(`Removed. ${next.length} remaining.`);
  }

  return (
    <section aria-labelledby={`${idPrefix}-label`} className="flex flex-col gap-3">
      <h3
        id={`${idPrefix}-label`}
        className="text-sm font-semibold uppercase tracking-wider text-fg"
      >
        {label}
      </h3>
      <p className="text-xs text-fg-muted">{description}</p>

      {listErrors?.length ? (
        <p className="text-xs font-medium text-danger">{listErrors.join(" ")}</p>
      ) : null}

      {phrases.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No alternatives yet — the label above is shown on its own.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {phrases.map((phrase, index) => {
            const inputId = `${idPrefix}-phrase-${index}`;
            const rowErrors = errors[`${errorKey}.${index}`];
            return (
              <li
                key={index}
                className="rounded-lg border border-subtle bg-surface p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <label htmlFor={inputId} className="sr-only">
                      {/* The visible number is decoration; this is the name
                          assistive technology reads. */}
                      {label}, alternative {index + 2}
                    </label>
                    <input
                      id={inputId}
                      type="text"
                      value={phrase}
                      placeholder={placeholder}
                      onChange={(event) => {
                        const next = [...phrases];
                        next[index] = event.target.value;
                        onChange(next);
                      }}
                      aria-invalid={rowErrors?.length ? true : undefined}
                      aria-describedby={
                        rowErrors?.length ? `${inputId}-error` : undefined
                      }
                      className="w-full rounded-md border border-strong bg-bg px-3 py-2 text-sm text-fg"
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
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-strong text-sm text-fg disabled:opacity-40"
                    >
                      <span aria-hidden="true">↑</span>
                      <span className="sr-only">Move “{phrase}” up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === phrases.length - 1}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-strong text-sm text-fg disabled:opacity-40"
                    >
                      <span aria-hidden="true">↓</span>
                      <span className="sr-only">Move “{phrase}” down</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-strong text-sm text-danger"
                    >
                      <span aria-hidden="true">✕</span>
                      <span className="sr-only">Remove “{phrase}”</span>
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
            onChange([...phrases, ""]);
            setStatus(`Added. ${phrases.length + 1} in the rotation.`);
          }}
          disabled={phrases.length >= max}
          className="inline-flex min-h-11 items-center rounded-md border border-strong bg-surface px-3 text-sm font-medium text-fg disabled:opacity-40"
        >
          Add alternative
        </button>
        {phrases.length >= max ? (
          <p className="mt-2 text-xs text-fg-muted">
            {max} is the maximum — a rotation longer than that is one nobody
            follows.
          </p>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  );
}
