"use client";

/**
 * The profile editor.
 *
 * A singleton form, so it differs from the collection forms in two ways
 * that matter to the user rather than to the code:
 *
 *   * there is no "create" versus "edit" mode — the same screen configures
 *     the profile for the first time and edits it afterwards;
 *   * a successful save stays here and confirms, rather than navigating
 *     somewhere else, because there is nowhere else to go.
 *
 * Everything else is the established pattern: no form library,
 * `useActionState` for pending state and server errors, the shared field
 * primitives for labelling and ARIA wiring, and an error summary that takes
 * focus. Server-side Zod remains the source of truth.
 *
 * The singleton key is never rendered, never submitted, and not part of the
 * validated payload.
 */

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { ProfileMutationData } from "@/lib/actions/profile";
import { TextAreaField, TextField } from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";

export interface ProfileFormValues {
  /** The chosen media asset id, or `""` for no photograph. */
  avatarMediaId: string;
  xrayMediaId: string;
  fullName: string;
  headline: string;
  tagline: string;
  bio: string;
  location: string;
  availability: string;
  publicEmail: string;
}

export const emptyProfileValues: ProfileFormValues = {
  avatarMediaId: "",
  xrayMediaId: "",
  fullName: "",
  headline: "",
  tagline: "",
  bio: "",
  location: "",
  availability: "",
  publicEmail: "",
};

type ProfileAction = (
  previous: ActionState<ProfileMutationData>,
  formData: FormData,
) => Promise<ActionState<ProfileMutationData>>;

export function ProfileForm({
  action,
  initialValues,
  isConfigured,
  mediaOptions,
}: {
  action: ProfileAction;
  initialValues: ProfileFormValues;
  /** Whether a profile row already existed when this page was rendered. */
  isConfigured: boolean;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;
  const saved = state.status === "success";

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify(values);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />

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

        <TextField
          id={`${fieldId}-full-name`}
          name="fullName"
          label="Full name"
          required
          value={values.fullName}
          errors={fieldErrors.fullName}
          hint="The name shown across the public site."
          onChange={(value) => update("fullName", value)}
        />

        <TextField
          id={`${fieldId}-headline`}
          name="headline"
          label="Headline"
          required
          value={values.headline}
          errors={fieldErrors.headline}
          hint="A short professional title, e.g. “Software Engineer”."
          onChange={(value) => update("headline", value)}
        />

        <TextField
          id={`${fieldId}-tagline`}
          name="tagline"
          label="Tagline"
          value={values.tagline}
          errors={fieldErrors.tagline}
          hint="Optional one-line summary shown beneath the headline."
          onChange={(value) => update("tagline", value)}
        />
      </section>

      <section aria-labelledby={`${fieldId}-about`} className="flex flex-col gap-5">
        <h2
          id={`${fieldId}-about`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          About
        </h2>

        <TextAreaField
          id={`${fieldId}-bio`}
          name="bio"
          label="Bio"
          rows={8}
          value={values.bio}
          errors={fieldErrors.bio}
          hint="Multi-paragraph prose. Blank lines separate paragraphs."
          onChange={(value) => update("bio", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-contact`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-contact`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Contact and availability
        </h2>

        <TextField
          id={`${fieldId}-location`}
          name="location"
          label="Location"
          value={values.location}
          errors={fieldErrors.location}
          hint="Optional, e.g. “Bengaluru, India”."
          onChange={(value) => update("location", value)}
        />

        <TextField
          id={`${fieldId}-availability`}
          name="availability"
          label="Availability"
          value={values.availability}
          errors={fieldErrors.availability}
          hint="Optional, e.g. “Open to opportunities”."
          onChange={(value) => update("availability", value)}
        />

        <TextField
          id={`${fieldId}-public-email`}
          name="publicEmail"
          label="Public email"
          type="text"
          value={values.publicEmail}
          errors={fieldErrors.publicEmail}
          hint="Optional. Shown publicly, so use an address you are happy to publish."
          onChange={(value) => update("publicEmail", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-avatar-heading`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-avatar-heading`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Photograph
        </h2>

        {/* Labelled "photograph", not "icon": this is a picture of a
            person, which is why the column is avatar_media_id. */}
        <MediaPickerField
          id={`${fieldId}-avatar`}
          label="Profile photo"
          value={values.avatarMediaId}
          options={mediaOptions}
          errors={fieldErrors.avatarMediaId}
          hint="Optional photograph shown on the public site."
          onChange={(value) => update("avatarMediaId", value)}
        />

        {/*
          The second half of a pair.

          The hero opens a circular window onto this image as the pointer
          moves across the photograph above, so the two only work together if
          they were shot or rendered in the same frame — same crop, same pose,
          same size. Nothing here can check that: no validation can tell
          whether two pictures line up, so the hint says it plainly instead.

          Leaving it empty is a supported state, not an incomplete one. The
          public site falls back to a drawn figure.
        */}
        <MediaPickerField
          id={`${fieldId}-xray`}
          label="X-ray photo"
          value={values.xrayMediaId}
          options={mediaOptions}
          errors={fieldErrors.xrayMediaId}
          hint="Optional. Revealed under the profile photo when a visitor hovers it. Use the same pose and crop as the photo above, or the two will not line up."
          onChange={(value) => update("xrayMediaId", value)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending
            ? "Saving…"
            : isConfigured
              ? "Save changes"
              : "Create profile"}
        </button>

        {/* Politely announced rather than alert-level: a successful save is
            confirmation, not an interruption, and must not steal focus. */}
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          className="text-sm text-fg-muted"
        >
          {saved ? "Profile saved." : ""}
        </p>
      </div>
    </form>
  );
}
