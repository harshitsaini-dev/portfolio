"use client";

/**
 * A colour, chosen from a picker rather than typed.
 *
 * ## Why the text box went away
 *
 * Every accent in this CMS was a text input asking for a six-digit hex. That
 * is a fine *storage* format and a poor *input* one: it asks an editor to know
 * what `#7c3aed` looks like, to type it without a typo, and to know that
 * `rgb(124, 58, 237)` and `purple` will be rejected. The browser has had a
 * colour picker for years — one that opens the platform's own eyedropper on
 * every desktop and a proper wheel on a phone.
 *
 * So the picker is the control, and the hex is shown beside it as a read-only
 * label. The stored value does not change: still a six-digit hex, still
 * validated by the same schema, still set as a custom property rather than
 * interpolated into CSS.
 *
 * ## "No colour" is a real state, so it needs a real control
 *
 * A native `<input type="color">` cannot be empty — it is `#000000` when it
 * has nothing, which would silently turn "follow the site accent" into
 * "black". The empty case therefore lives outside the picker: the field starts
 * in a "follow" state showing what it would inherit, choosing a colour leaves
 * it, and Clear returns to it. That is why the real value goes to the server
 * in a hidden input rather than from the picker itself.
 *
 * ## It says when a colour will not do its job
 *
 * The accent draws links, section labels and the focus ring — non-text and
 * large-text elements, whose WCAG minimum is 3:1 against the page. A colour
 * that misses it in either theme produces a focus indicator nobody can see,
 * which is how a keyboard user loses their place.
 *
 * The site accent has warned about this since it was added; the per-screen and
 * per-row pickers did not, and an end-to-end test caught the consequence — a
 * green accent chosen for a check measured **2.72:1** in the light theme, and
 * four tab stops failed with it. The warning is the same assessment, in every
 * picker now.
 *
 * It warns rather than refuses. The threshold is a rule about legibility, not
 * about taste, and an owner who wants a colour for one section on a page they
 * control should be told what it costs rather than prevented.
 *
 * ## The swatch is not the only signal
 *
 * The hex is printed next to it, and the state is written in words. Colour
 * alone would leave anyone who cannot distinguish the two states with no way
 * to tell whether a colour has been set.
 */

import { useId } from "react";

import { assessAccent } from "@portfolio/ui";

export function ColourField({
  name,
  label,
  hint,
  value,
  fallback,
  errors,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  /** The stored value: a six-digit hex, or `""` for "follow the fallback". */
  value: string;
  /**
   * What is inherited when this is empty — the site accent, usually. Shown in
   * the swatch so the editor sees what "follow" actually looks like.
   */
  fallback: string;
  errors?: string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const isSet = value.trim().length > 0;
  // Only a fully typed hex can be assessed; the picker always produces one,
  // but the stored value may be empty while it follows the site.
  const assessment = /^#[0-9a-f]{6}$/i.test(value.trim())
    ? assessAccent(value.trim())
    : null;
  const shown = isSet ? value : fallback;
  const describedBy = [hint ? `${id}-hint` : null, errors?.length ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-picker`} className="text-sm font-medium text-fg">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {/*
          The real control. `h-11 w-14` rather than the browser's default
          20px box: a swatch you cannot hit is a swatch nobody uses on a phone.
        */}
        <input
          id={`${id}-picker`}
          type="color"
          value={shown}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-14 cursor-pointer rounded-md border border-strong bg-surface p-1"
        />

        {/* The value in words as well as in colour. */}
        <span className="font-mono text-sm text-fg-muted">
          {isSet ? value : `${fallback} (following the site)`}
        </span>

        {isSet ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex min-h-11 items-center rounded-md border border-subtle px-3 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/*
        What actually reaches the server. The picker cannot hold "", so the
        stored value travels separately — this is the field the action reads.
      */}
      <input type="hidden" name={name} value={value} />

      {assessment && !assessment.usableInBothThemes ? (
        /* `role="status"`, not `alert`: it is advice about a choice the owner
           just made, not an error that stopped anything. */
        <p role="status" className="text-sm text-fg-muted">
          <span className="font-medium text-danger">Low contrast.</span> This
          colour measures {assessment.onLight}:1 on the light background and{" "}
          {assessment.onDark}:1 on the dark one. Links and the focus ring need
          3:1 to stay visible — a keyboard user may lose track of where they
          are.
        </p>
      ) : null}

      {errors?.length ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
