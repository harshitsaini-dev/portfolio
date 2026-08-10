"use client";

/**
 * The project create/edit form.
 *
 * A Client Component because it manages dynamic relationship rows and
 * renders server validation errors inline. It holds **no authorization
 * logic** — it posts to a Server Action that independently authenticates.
 *
 * No form library. React 19's `useActionState` already supplies submission
 * state, pending state, and the server's typed result; the only thing left
 * is array rows for links, which is a few lines of `useState`. Adding React
 * Hook Form plus a resolver would mean two more packages in an edge bundle
 * to replace roughly forty lines. See docs/DECISIONS.md.
 *
 * Client-side checks here are purely a UX affordance — **the server's Zod
 * schema is the only validation that counts**, and it re-validates every
 * field regardless of what this component allowed.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  PROJECT_LINK_KINDS,
  PROJECT_STATUSES,
  type ProjectLinkKind,
  type ProjectStatus,
  type Technology,
} from "@portfolio/types";
import { suggestSlug } from "@portfolio/schemas";

import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/field";
import {
  MediaPickerField,
  type MediaOption,
} from "@/components/media/media-picker-field";
import type { ProjectMutationData } from "@/lib/actions/projects";
import { isErrorResult, idleState, type ActionState } from "@/lib/actions/result";

export interface ProjectFormValues {
  /** The small mark shown beside the title in lists. `""` for none. */
  iconMediaId: string;
  /** The large image heading the case study. `""` for none. */
  coverMediaId: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  /** Case study. Any of the three may be blank; the page skips what is. */
  problem: string;
  solution: string;
  learnings: string;
  status: ProjectStatus;
  isFeatured: boolean;
  position: number;
  periodLabel: string;
  startedOn: string;
  completedOn: string;
  links: { label: string; url: string; kind: ProjectLinkKind }[];
  /** Gallery attachments, in the order they are shown. */
  media: { mediaAssetId: string; caption: string }[];
  technologyIds: string[];
}

export const emptyProjectValues: ProjectFormValues = {
  iconMediaId: "",
  coverMediaId: "",
  title: "",
  slug: "",
  summary: "",
  description: "",
  problem: "",
  solution: "",
  learnings: "",
  status: "draft",
  isFeatured: false,
  position: 0,
  periodLabel: "",
  startedOn: "",
  completedOn: "",
  links: [],
  media: [],
  technologyIds: [],
};

type ProjectAction = (
  previous: ActionState<ProjectMutationData>,
  formData: FormData,
) => Promise<ActionState<ProjectMutationData>>;

export function ProjectForm({
  action,
  projectId,
  initialValues,
  technologies,
  submitLabel,
  mediaOptions,
}: {
  action: ProjectAction;
  projectId?: string;
  initialValues: ProjectFormValues;
  technologies: readonly Technology[];
  submitLabel: string;
  /** Uploaded assets to choose from, read on the server by the page. */
  mediaOptions: readonly MediaOption[];
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<ProjectFormValues>(initialValues);
  // Auto-slug only until the user edits the slug themselves; after that the
  // typed value is never silently overwritten.
  const [slugTouched, setSlugTouched] = useState(initialValues.slug.length > 0);
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  // Move focus to the error summary so a keyboard or screen-reader user is
  // taken to the problem rather than left at the bottom of the form.
  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);


  function update<K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Serialized once, so the server parses exactly one trusted-shape blob. */
  const payload = JSON.stringify({
    title: values.title,
    slug: values.slug,
    summary: values.summary,
    description: values.description,
    problem: values.problem,
    solution: values.solution,
    learnings: values.learnings,
    status: values.status,
    isFeatured: values.isFeatured,
    position: Number.isFinite(values.position) ? values.position : 0,
    periodLabel: values.periodLabel,
    startedOn: values.startedOn,
    completedOn: values.completedOn,
    iconMediaId: values.iconMediaId,
    coverMediaId: values.coverMediaId,
    links: values.links,
    technologyIds: values.technologyIds,
    /*
      Sent whole, and only the rows with an asset chosen.

      The action replaces the collection wholesale, so a half-filled row
      would either fail validation or persist a gallery entry pointing at
      nothing. Dropping them here means "add" can leave an empty row on
      screen without it being a save-blocking error.

      `caption` is normalised to null rather than "": the column is nullable
      and the schema turns blank into null anyway, so sending "" would be the
      one place a caption could round-trip as an empty string.
    */
    media: values.media
      .filter((item) => item.mediaAssetId !== "")
      .map((item) => ({
        mediaAssetId: item.mediaAssetId,
        caption: item.caption.trim() === "" ? null : item.caption,
      })),
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {projectId ? <input type="hidden" name="id" value={projectId} /> : null}

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

      <section aria-labelledby={`${fieldId}-basics`} className="flex flex-col gap-5">
        <h2 id={`${fieldId}-basics`} className="text-sm font-semibold uppercase tracking-wider text-fg">
          Basics
        </h2>
        <TextField
          id={`${fieldId}-title`}
          name="title"
          label="Title"
          required
          value={values.title}
          errors={fieldErrors.title}
          onChange={(value) => {
            update("title", value);
            if (!slugTouched) update("slug", suggestSlug(value));
          }}
        />
        <TextField
          id={`${fieldId}-slug`}
          name="slug"
          label="Slug"
          required
          hint={
            slugTouched
              ? "Used in the public URL. Must be unique."
              : "Suggested from the title. Edit it to set your own — it will not be overwritten after that."
          }
          value={values.slug}
          errors={fieldErrors.slug}
          onChange={(value) => {
            setSlugTouched(true);
            update("slug", value);
          }}
        />
        <TextAreaField
          id={`${fieldId}-summary`}
          name="summary"
          label="Summary"
          required
          rows={3}
          hint="Shown on project cards."
          value={values.summary}
          errors={fieldErrors.summary}
          onChange={(value) => update("summary", value)}
        />
        <TextAreaField
          id={`${fieldId}-description`}
          name="description"
          label="Description"
          rows={6}
          hint="Optional longer detail."
          value={values.description}
          errors={fieldErrors.description}
          onChange={(value) => update("description", value)}
        />
      </section>

      {/*
        Its own section, and named for what a reader gets rather than for the
        columns it writes. The order is the order the page renders — problem,
        then solution, then what it taught — so the form reads as the story it
        is asking for instead of three unrelated boxes.
      */}
      <section aria-labelledby={`${fieldId}-case-study`} className="flex flex-col gap-5">
        <h2 id={`${fieldId}-case-study`} className="text-sm font-semibold uppercase tracking-wider text-fg">
          Case study
        </h2>
        <p className="-mt-2 text-sm text-fg-muted">
          Optional. Anything left blank is skipped on the project page, so a
          project can answer one of these and none of the others. The stack is
          not here — it comes from the technologies you tag below.
        </p>
        <TextAreaField
          id={`${fieldId}-problem`}
          name="problem"
          label="Problem"
          rows={4}
          hint="What was wrong, or what needed to exist."
          value={values.problem}
          errors={fieldErrors.problem}
          onChange={(value) => update("problem", value)}
        />
        <TextAreaField
          id={`${fieldId}-solution`}
          name="solution"
          label="Solution"
          rows={4}
          hint="What you built, and the decisions worth knowing about."
          value={values.solution}
          errors={fieldErrors.solution}
          onChange={(value) => update("solution", value)}
        />
        <TextAreaField
          id={`${fieldId}-learnings`}
          name="learnings"
          label="Learnings"
          rows={4}
          hint="What you know now that you did not before."
          value={values.learnings}
          errors={fieldErrors.learnings}
          onChange={(value) => update("learnings", value)}
        />
      </section>

      <section aria-labelledby={`${fieldId}-publishing`} className="flex flex-col gap-5">
        <h2 id={`${fieldId}-publishing`} className="text-sm font-semibold uppercase tracking-wider text-fg">
          Publishing
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id={`${fieldId}-status`}
            name="status"
            label="Status"
            value={values.status}
            errors={fieldErrors.status}
            options={PROJECT_STATUSES.map((status) => ({
              value: status,
              label: status.charAt(0).toUpperCase() + status.slice(1),
            }))}
            onChange={(value) => update("status", value as ProjectStatus)}
          />
          <TextField
            id={`${fieldId}-position`}
            name="position"
            label="Position"
            type="number"
            min={0}
            hint="Lower numbers appear first."
            value={String(values.position)}
            errors={fieldErrors.position}
            onChange={(value) => update("position", Number.parseInt(value, 10) || 0)}
          />
          <TextField
            id={`${fieldId}-period`}
            name="periodLabel"
            label="Period label"
            hint="Display text, e.g. 2024 – 2025."
            value={values.periodLabel}
            errors={fieldErrors.periodLabel}
            onChange={(value) => update("periodLabel", value)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id={`${fieldId}-started`}
              name="startedOn"
              label="Started on"
              type="date"
              value={values.startedOn}
              errors={fieldErrors.startedOn}
              onChange={(value) => update("startedOn", value)}
            />
            <TextField
              id={`${fieldId}-completed`}
              name="completedOn"
              label="Completed on"
              type="date"
              value={values.completedOn}
              errors={fieldErrors.completedOn}
              onChange={(value) => update("completedOn", value)}
            />
          </div>
        </div>
        <CheckboxField
          id={`${fieldId}-featured`}
          name="isFeatured"
          label="Featured"
          hint="Highlighted on the public site."
          checked={values.isFeatured}
          onChange={(checked) => update("isFeatured", checked)}
        />
      </section>

      <LinksSection
        idPrefix={fieldId}
        links={values.links}
        errors={fieldErrors}
        onChange={(links) => update("links", links)}
      />

      <TechnologiesSection
        idPrefix={fieldId}
        technologies={technologies}
        selectedIds={values.technologyIds}
        errors={fieldErrors.technologyIds}
        onChange={(ids) => update("technologyIds", ids)}
      />

      <GallerySection
        idPrefix={fieldId}
        media={values.media}
        mediaOptions={mediaOptions}
        errors={fieldErrors}
        onChange={(media) => update("media", media)}
      />

      <section
        aria-labelledby={`${fieldId}-imagery-heading`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-imagery-heading`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Imagery
        </h2>

        {/* Two images, not one. The cover heads the case study at full
            width; the icon sits beside the title in lists and cards, at
            about 40px. One file rarely reads well at both sizes. */}
        <MediaPickerField
          id={`${fieldId}-cover`}
          label="Cover image"
          value={values.coverMediaId}
          options={mediaOptions}
          errors={fieldErrors.coverMediaId}
          hint="Large image shown at the top of the project page."
          onChange={(value) => update("coverMediaId", value)}
        />

        <MediaPickerField
          id={`${fieldId}-icon`}
          label="Icon"
          value={values.iconMediaId}
          options={mediaOptions}
          errors={fieldErrors.iconMediaId}
          hint="Small mark shown beside the title in project lists."
          onChange={(value) => update("iconMediaId", value)}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-subtle pt-6">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        <Link
          href="/projects"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function LinksSection({
  idPrefix,
  links,
  errors,
  onChange,
}: {
  idPrefix: string;
  links: ProjectFormValues["links"];
  errors: Record<string, string[]>;
  onChange: (links: ProjectFormValues["links"]) => void;
}) {
  return (
    <section aria-labelledby={`${idPrefix}-links`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${idPrefix}-links`} className="text-sm font-semibold uppercase tracking-wider text-fg">
          Links
        </h2>
        <button
          type="button"
          onClick={() => onChange([...links, { label: "", url: "", kind: "other" }])}
          className="inline-flex min-h-11 items-center rounded-md border border-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Add link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-fg-muted">No links yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {links.map((link, index) => (
            <li
              key={index}
              className="rounded-lg border border-subtle bg-surface p-4"
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <TextField
                  id={`${idPrefix}-link-${index}-label`}
                  name={`links.${index}.label`}
                  label="Label"
                  value={link.label}
                  errors={errors[`links.${index}.label`]}
                  onChange={(value) => {
                    const next = [...links];
                    next[index] = { ...link, label: value };
                    onChange(next);
                  }}
                />
                <TextField
                  id={`${idPrefix}-link-${index}-url`}
                  name={`links.${index}.url`}
                  label="URL"
                  type="url"
                  placeholder="https://"
                  value={link.url}
                  errors={errors[`links.${index}.url`]}
                  onChange={(value) => {
                    const next = [...links];
                    next[index] = { ...link, url: value };
                    onChange(next);
                  }}
                />
                <SelectField
                  id={`${idPrefix}-link-${index}-kind`}
                  name={`links.${index}.kind`}
                  label="Kind"
                  value={link.kind}
                  errors={errors[`links.${index}.kind`]}
                  options={PROJECT_LINK_KINDS.map((kind) => ({
                    value: kind,
                    label: kind.replace(/_/g, " "),
                  }))}
                  onChange={(value) => {
                    const next = [...links];
                    next[index] = { ...link, kind: value as ProjectLinkKind };
                    onChange(next);
                  }}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onChange(links.filter((_, i) => i !== index))}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
                >
                  Remove
                  <span className="sr-only"> link {index + 1}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The per-project gallery.
 *
 * Rows of "pick an asset, optionally caption it", in the order they appear on
 * the case-study page. Position is **implied by the order of the rows**, not
 * typed in: the action assigns `position: index` when it saves, so there is no
 * second source of truth to contradict the list an editor is looking at.
 *
 * Reordering is by moving a row up or down rather than by drag: buttons work
 * with a keyboard and a screen reader without any extra machinery, and this
 * list is a handful of items rather than a hundred.
 *
 * The public page renders whatever is here — it has done since the case-study
 * route was built, and this form's `media: []` was the only reason nothing
 * ever appeared.
 */
function GallerySection({
  idPrefix,
  media,
  mediaOptions,
  errors,
  onChange,
}: {
  idPrefix: string;
  media: ProjectFormValues["media"];
  mediaOptions: readonly MediaOption[];
  errors: Record<string, string[]>;
  onChange: (media: ProjectFormValues["media"]) => void;
}) {
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;
    onChange(next);
  }

  return (
    <section
      aria-labelledby={`${idPrefix}-media`}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`${idPrefix}-media`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Gallery
        </h2>
        <button
          type="button"
          onClick={() => onChange([...media, { mediaAssetId: "", caption: "" }])}
          className="inline-flex min-h-11 items-center rounded-md border border-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Add image
        </button>
      </div>

      <p className="text-sm text-fg-muted">
        Shown on the project’s own page, in this order. The cover image below
        is separate — it heads the card and the page, and does not need to be
        repeated here.
      </p>

      {media.length === 0 ? (
        <p className="text-sm text-fg-muted">No gallery images yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {media.map((item, index) => (
            // Keyed by index rather than by asset id: a new row starts with no
            // asset, and two empty rows would collide on any content-derived
            // key. The list is only ever reordered as a whole.
            <li
              key={index}
              className="rounded-lg border border-subtle bg-surface p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <MediaPickerField
                  id={`${idPrefix}-media-${index}-asset`}
                  label={`Image ${index + 1}`}
                  value={item.mediaAssetId}
                  options={mediaOptions}
                  errors={errors[`media.${index}.mediaAssetId`]}
                  hint="Choose an uploaded image."
                  onChange={(value) => {
                    const next = [...media];
                    next[index] = { ...item, mediaAssetId: value };
                    onChange(next);
                  }}
                />
                <TextField
                  id={`${idPrefix}-media-${index}-caption`}
                  name={`media.${index}.caption`}
                  label="Caption"
                  value={item.caption}
                  errors={errors[`media.${index}.caption`]}
                  hint="Optional. Shown beneath the image."
                  onChange={(value) => {
                    const next = [...media];
                    next[index] = { ...item, caption: value };
                    onChange(next);
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move up
                  <span className="sr-only"> — image {index + 1}</span>
                </button>
                <button
                  type="button"
                  disabled={index === media.length - 1}
                  onClick={() => move(index, 1)}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move down
                  <span className="sr-only"> — image {index + 1}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange(media.filter((_, i) => i !== index))}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-danger transition-colors duration-150 hover:bg-surface-muted"
                >
                  Remove
                  <span className="sr-only"> image {index + 1}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TechnologiesSection({
  idPrefix,
  technologies,
  selectedIds,
  errors,
  onChange,
}: {
  idPrefix: string;
  technologies: readonly Technology[];
  selectedIds: string[];
  errors?: string[];
  onChange: (ids: string[]) => void;
}) {
  const errorId = `${idPrefix}-tech-error`;

  return (
    <section aria-labelledby={`${idPrefix}-tech`} className="flex flex-col gap-3">
      <h2 id={`${idPrefix}-tech`} className="text-sm font-semibold uppercase tracking-wider text-fg">
        Technologies
      </h2>

      {technologies.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No technologies exist yet. Create them before tagging a project.
        </p>
      ) : (
        <fieldset
          aria-describedby={errors?.length ? errorId : undefined}
          className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-subtle bg-surface p-4"
        >
          <legend className="sr-only">Select technologies</legend>
          {technologies.map((technology) => {
            const inputId = `${idPrefix}-tech-${technology.id}`;
            const checked = selectedIds.includes(technology.id);
            return (
              <div key={technology.id} className="flex items-center gap-2">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selectedIds, technology.id]
                        : selectedIds.filter((id) => id !== technology.id),
                    )
                  }
                  className="size-4 rounded border-strong"
                />
                <label htmlFor={inputId} className="text-sm text-fg">
                  {technology.name}
                </label>
              </div>
            );
          })}
        </fieldset>
      )}

      {errors?.length ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </section>
  );
}
