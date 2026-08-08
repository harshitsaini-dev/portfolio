"use client";

/**
 * Site settings editor.
 *
 * Same architecture as every other form here: no form library,
 * `useActionState` for pending state and server-returned errors, the shared
 * field primitives for labelling and ARIA wiring, and an error summary that
 * takes focus. Server-side Zod remains the source of truth — nothing in this
 * file is a validation boundary.
 *
 * ## The accent preview is a preview, not a validator
 *
 * It shows what the colour will look like and what its contrast is, and it
 * **warns rather than blocks**. A dark accent on a dark background is a real
 * problem, but the editor may be about to change the default theme, or may
 * simply want it. Refusing would be the CMS overruling its owner.
 *
 * The threshold is 3:1, not 4.5:1: the accent is used for eyebrows, links and
 * the focus ring, whose WCAG minimum is 3:1. Holding it to the body-text
 * threshold would reject usable brand colours for a rule that does not apply
 * to them.
 */

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { HEX_COLOR_PATTERN } from "@portfolio/schemas";
import { assessAccent } from "@portfolio/ui";
import type { ThemePreference } from "@portfolio/types";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { SettingsMutationData } from "@/lib/actions/settings";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface SettingsFormValues {
  siteName: string;
  siteDescription: string;
  defaultTheme: ThemePreference;
  /** `#rrggbb`, or `""` to use the built-in accent. */
  accentColor: string;
  socialImageId: string;
  faviconMediaId: string;
  isContactEnabled: boolean;
}

export const emptySettingsValues: SettingsFormValues = {
  siteName: "",
  siteDescription: "",
  defaultTheme: "system",
  accentColor: "",
  socialImageId: "",
  faviconMediaId: "",
  isContactEnabled: true,
};

type SettingsAction = (
  previous: ActionState<SettingsMutationData>,
  formData: FormData,
) => Promise<ActionState<SettingsMutationData>>;

const THEME_OPTIONS = [
  { value: "system", label: "Follow the visitor's system setting" },
  { value: "light", label: "Always light" },
  { value: "dark", label: "Always dark" },
] as const;

/** The accent panel: swatch, measured contrast, and a warning when it is low. */
function AccentPreview({ value }: { value: string }) {
  const normalised = value.trim().toLowerCase();

  if (normalised.length === 0) {
    return (
      <p className="text-xs text-fg-muted">
        Leave blank to use the built-in accent, which is tuned separately for
        light and dark.
      </p>
    );
  }

  // Anything that is not a complete colour yet is simply not previewed. The
  // field's own error handling covers a value that stays malformed.
  if (!HEX_COLOR_PATTERN.test(normalised)) return null;

  const assessment = assessAccent(normalised);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 items-center rounded-md border border-subtle px-4 text-sm font-medium"
          style={{
            backgroundColor: normalised,
            color: assessment.foreground,
          }}
        >
          Accent
        </span>
        <p className="text-xs text-fg-muted">
          Text on the accent will be{" "}
          {assessment.foreground === "#ffffff" ? "white" : "black"}, chosen for
          contrast.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-fg-muted">
        <div className="flex gap-2">
          <dt>On light background</dt>
          <dd className="font-medium text-fg">{assessment.onLight}:1</dd>
        </div>
        <div className="flex gap-2">
          <dt>On dark background</dt>
          <dd className="font-medium text-fg">{assessment.onDark}:1</dd>
        </div>
      </dl>

      {assessment.usableInBothThemes ? null : (
        /* A warning, not an error: the save is allowed. `role="status"`
           rather than `alert` — this is information about a value the editor
           is still typing, not a failure. */
        <p
          role="status"
          className="rounded-md border border-danger/40 bg-surface p-3 text-xs text-fg"
        >
          <strong className="font-semibold">Low contrast.</strong> This colour
          falls below 3:1 against{" "}
          {assessment.onLight < 3 ? "the light" : "the dark"} background, so
          links and section labels using it will be hard to read there. You can
          still save it — pick a mid-tone colour if you want it to work in both
          themes.
        </p>
      )}
    </div>
  );
}

export function SettingsForm({
  action,
  initialValues,
  mediaOptions,
}: {
  action: SettingsAction;
  initialValues: SettingsFormValues;
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SettingsFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const payload = JSON.stringify(values);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

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

      {state.status === "success" ? (
        <p role="status" className="text-sm text-fg-muted">
          Saved. The public site picks this up on its next request.
        </p>
      ) : null}

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

        <TextField
          id={`${fieldId}-site-name`}
          name="siteName"
          label="Site name"
          required
          value={values.siteName}
          errors={fieldErrors.siteName}
          hint="Used in the browser tab and for link previews."
          onChange={(value) => update("siteName", value)}
        />

        <TextAreaField
          id={`${fieldId}-site-description`}
          name="siteDescription"
          label="Site description"
          value={values.siteDescription}
          errors={fieldErrors.siteDescription}
          hint="One or two sentences, shown by search engines and link previews."
          rows={3}
          onChange={(value) => update("siteDescription", value)}
        />

        <MediaPickerField
          id={`${fieldId}-social-image`}
          label="Link preview image"
          value={values.socialImageId}
          options={mediaOptions}
          errors={fieldErrors.socialImageId}
          hint="Shown when the site is shared on social media."
          onChange={(value) => update("socialImageId", value)}
        />

        <MediaPickerField
          id={`${fieldId}-favicon`}
          label="Favicon"
          value={values.faviconMediaId}
          options={mediaOptions}
          errors={fieldErrors.faviconMediaId}
          hint="The browser-tab icon. Use a square image that stays legible at 16px — a full logo with text will not."
          onChange={(value) => update("faviconMediaId", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-appearance`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-appearance`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Appearance
        </h2>

        <SelectField
          id={`${fieldId}-theme`}
          name="defaultTheme"
          label="Default theme"
          value={values.defaultTheme}
          options={THEME_OPTIONS}
          errors={fieldErrors.defaultTheme}
          hint="What a first-time visitor sees."
          onChange={(value) =>
            update("defaultTheme", value as ThemePreference)
          }
        />

        <TextField
          id={`${fieldId}-accent`}
          name="accentColor"
          label="Accent colour"
          value={values.accentColor}
          errors={fieldErrors.accentColor}
          hint="Six-digit hex, e.g. #2547d0. Used for links, section labels and the focus ring."
          onChange={(value) => update("accentColor", value)}
        />

        <AccentPreview value={values.accentColor} />
      </section>

      <section
        aria-labelledby={`${fieldId}-features`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-features`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Features
        </h2>

        <CheckboxField
          id={`${fieldId}-contact`}
          name="isContactEnabled"
          label="Show the contact section"
          checked={values.isContactEnabled}
          hint="Hides the contact section on the public site when off."
          onChange={(checked) => update("isContactEnabled", checked)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
