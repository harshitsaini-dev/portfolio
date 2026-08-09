"use client";

/**
 * 3D scene settings.
 *
 * A separate form from the site settings, on the same page. They are a
 * different concern with a different audience: an editor changing the site
 * name should not have to scroll past a pixel-ratio control, and someone
 * tuning the scene is not thinking about link previews.
 *
 * ## Everything here is a permission, not an instruction
 *
 * The copy says so explicitly, because it is the thing most likely to be
 * misread. Enabling the scene means "allowed to run" — the browser still
 * refuses it for a visitor who asked for reduced motion, on a small screen
 * when small screens are not enabled, and on any device where a WebGL context
 * cannot be created.
 */

import { useActionState, useEffect, useId, useRef, useState } from "react";

import type { SceneQualityPreset } from "@portfolio/types";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { SettingsMutationData } from "@/lib/actions/settings";
import { CheckboxField, SelectField, TextField } from "@/components/form/field";

export interface SceneFormValues {
  isEnabled: boolean;
  qualityPreset: SceneQualityPreset;
  isMobileEnabled: boolean;
  isSpeechEnabled: boolean;
  maxPixelRatio: string;
}

export const emptySceneValues: SceneFormValues = {
  isEnabled: false,
  qualityPreset: "balanced",
  isMobileEnabled: false,
  isSpeechEnabled: true,
  maxPixelRatio: "2",
};

type SceneAction = (
  previous: ActionState<SettingsMutationData>,
  formData: FormData,
) => Promise<ActionState<SettingsMutationData>>;

const QUALITY_OPTIONS = [
  { value: "low", label: "Low — fewest effects" },
  { value: "balanced", label: "Balanced" },
  { value: "high", label: "High — most detail" },
] as const;

export function SceneForm({
  action,
  initialValues,
}: {
  action: SceneAction;
  initialValues: SceneFormValues;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<SceneFormValues>(initialValues);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof SceneFormValues>(
    key: K,
    value: SceneFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // The ratio is a text field so a partially typed value does not become 0.
  // The number is produced here; the schema is still what validates it.
  const parsedRatio = Number.parseFloat(values.maxPixelRatio);
  const payload = JSON.stringify({
    isEnabled: values.isEnabled,
    qualityPreset: values.qualityPreset,
    isMobileEnabled: values.isMobileEnabled,
    isSpeechEnabled: values.isSpeechEnabled,
    maxPixelRatio: Number.isFinite(parsedRatio) ? parsedRatio : 2,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-6">
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
            <strong className="font-semibold text-danger">Could not save</strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      {state.status === "success" ? (
        <p role="status" className="text-sm text-fg-muted">
          Saved.
        </p>
      ) : null}

      <CheckboxField
        id={`${fieldId}-enabled`}
        name="isEnabled"
        label="Allow the 3D scene"
        checked={values.isEnabled}
        hint="A permission, not a guarantee: the browser still skips it for reduced motion, for small screens below, and where WebGL is unavailable."
        onChange={(checked) => update("isEnabled", checked)}
      />

      <CheckboxField
        id={`${fieldId}-mobile`}
        name="isMobileEnabled"
        label="Allow it on small screens too"
        checked={values.isMobileEnabled}
        hint="Off by default. The device most likely to be on a battery and a slow connection benefits least."
        onChange={(checked) => update("isMobileEnabled", checked)}
      />

      <CheckboxField
        id={`${fieldId}-speech`}
        name="isSpeechEnabled"
        label="Let the robot talk"
        checked={values.isSpeechEnabled}
        hint="On by default. Shows a short line in a bubble above the figure every few seconds — facts, quotes and a greeting set to Indian time. Turning it off leaves the figure itself untouched."
        onChange={(checked) => update("isSpeechEnabled", checked)}
      />

      <SelectField
        id={`${fieldId}-quality`}
        name="qualityPreset"
        label="Quality"
        value={values.qualityPreset}
        options={QUALITY_OPTIONS}
        errors={fieldErrors.qualityPreset}
        hint="A ceiling for future scene detail."
        onChange={(value) => update("qualityPreset", value as SceneQualityPreset)}
      />

      <TextField
        id={`${fieldId}-dpr`}
        name="maxPixelRatio"
        label="Maximum pixel ratio"
        value={values.maxPixelRatio}
        errors={fieldErrors.maxPixelRatio}
        hint="Between 0.5 and 4. Above 2 the cost is real and the difference is not — 4x renders sixteen times the pixels of 1x."
        onChange={(value) => update("maxPixelRatio", value)}
      />

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving…" : "Save scene settings"}
        </button>
      </div>
    </form>
  );
}
