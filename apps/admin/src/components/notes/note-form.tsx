"use client";

/**
 * Create/edit form for a note.
 *
 * The established architecture, unchanged: no form library, `useActionState`
 * for pending state and server-returned errors, the shared field primitives
 * for labelling and ARIA wiring, and an error summary that takes focus.
 * Server-side Zod remains the source of truth.
 *
 * Two things are specific to this form.
 *
 * **The slug follows the title until it is touched.** Typing a title fills the
 * URL; editing the URL stops that, permanently, for this editing session. The
 * alternative — always deriving it — silently changes the address of a
 * published post when its headline is reworded, which breaks every link to it.
 *
 * **The body is a plain textarea, not a rich editor.** The stored format is
 * Markdown, and a WYSIWYG surface that renders it would have to round-trip its
 * own output; every such editor eventually loses something on that trip. A
 * textarea is what the format is designed for, so the cheat sheet beside it is
 * the whole learning curve.
 */

import Link from "next/link";
import { ColourField } from "@/components/form/colour-field";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  idleState,
  isErrorResult,
  type ActionState,
} from "@/lib/actions/result";
import type { NoteMutationData } from "@/lib/actions/notes";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { MediaPickerField } from "@/components/media/media-picker-field";
import type { MediaOption } from "@/components/media/media-picker-field";

export interface NoteFormValues {
  slug: string;
  title: string;
  summary: string;
  body: string;
  status: string;
  publishedAt: string;
  coverMediaId: string;
  tags: string;
  position: number;
  /** `""` follows the site accent. */
  accent: string;
}

export const emptyNoteValues: NoteFormValues = {
  slug: "",
  title: "",
  summary: "",
  body: "",
  status: "draft",
  publishedAt: "",
  coverMediaId: "",
  tags: "",
  position: 0,
  accent: "",
};

/**
 * Title → URL.
 *
 * Deliberately lossy and deliberately simple: strip accents so "café" becomes
 * "cafe" rather than percent-escaping into noise, drop anything that is not a
 * letter, number or space, and collapse the rest to single hyphens. It matches
 * the server's slug rule, so what the field shows is what will validate.
 */
function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 96)
    .replace(/^-+|-+$/g, "");
}

type NoteAction = (
  previous: ActionState<NoteMutationData>,
  formData: FormData,
) => Promise<ActionState<NoteMutationData>>;

export function NoteForm({
  siteAccent,
  action,
  noteId,
  initialValues,
  mediaOptions,
  submitLabel,
}: {
  /** What this row falls back to: the site accent, for the swatch. */
  siteAccent: string;
  action: NoteAction;
  noteId?: string;
  initialValues: NoteFormValues;
  mediaOptions: readonly MediaOption[];
  submitLabel: string;
}) {
  const fieldId = useId();
  const [state, formAction, isPending] = useActionState(action, idleState);
  const [values, setValues] = useState<NoteFormValues>(initialValues);
  // An existing note already has its URL settled, so the title must not touch
  // it. A new one starts following along.
  const [slugLocked, setSlugLocked] = useState(Boolean(noteId));
  const summaryRef = useRef<HTMLDivElement>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};
  const errorMessage = isErrorResult(state) ? state.message : null;

  useEffect(() => {
    if (isErrorResult(state)) summaryRef.current?.focus();
  }, [state]);

  function update<K extends keyof NoteFormValues>(key: K, value: NoteFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const payload = JSON.stringify({
    ...values,
    position: Number.isFinite(values.position) ? values.position : 0,
  });

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-10">
      <input type="hidden" name="payload" value={payload} />
      {noteId ? <input type="hidden" name="id" value={noteId} /> : null}

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

      <section aria-labelledby={`${fieldId}-post`} className="flex flex-col gap-5">
        <h2
          id={`${fieldId}-post`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Post
        </h2>

        <TextField
          id={`${fieldId}-title`}
          name="title"
          label="Title"
          required
          value={values.title}
          errors={fieldErrors.title}
          hint="The headline. Shown in the list, on the page, and in the browser tab."
          onChange={(value) => {
            update("title", value);
            if (!slugLocked) update("slug", toSlug(value));
          }}
        />

        <TextField
          id={`${fieldId}-slug`}
          name="slug"
          label="URL"
          required
          value={values.slug}
          errors={fieldErrors.slug}
          hint="The address: /notes/your-slug. Lowercase letters, numbers and hyphens. Changing this on a published post breaks every existing link to it."
          onChange={(value) => {
            setSlugLocked(true);
            update("slug", value);
          }}
        />

        <TextAreaField
          id={`${fieldId}-summary`}
          name="summary"
          label="Summary"
          required
          rows={2}
          value={values.summary}
          errors={fieldErrors.summary}
          hint="One or two sentences. This is the line in the list, the description search engines show, and the text on a shared link — write it, don’t let it be the first sentence of the post."
          onChange={(value) => update("summary", value)}
        />

        <TextAreaField
          id={`${fieldId}-body`}
          name="body"
          label="Body"
          rows={20}
          value={values.body}
          errors={fieldErrors.body}
          hint="Markdown. See the reference below."
          onChange={(value) => update("body", value)}
        />

        {/*
          Collapsed by default: it is a reference, not instructions, and an
          always-open cheat sheet between the body and the save button is
          something an editor reads past every single time.
        */}
        <details className="rounded-md border border-subtle bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-fg">
            Markdown reference
          </summary>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["## Heading", "A section heading"],
              ["**bold**  *italic*", "Emphasis"],
              ["`code`", "Inline code"],
              ["```\ncode block\n```", "A fenced block, shown verbatim"],
              ["- item", "A bulleted list"],
              ["1. item", "A numbered list"],
              ["> quote", "A pull quote"],
              ["[text](https://…)", "A link"],
              ["![alt](/media/id)", "An image, with its description"],
              ["---", "A divider"],
            ].map(([syntax, meaning]) => (
              <div key={syntax} className="flex flex-col gap-1">
                <dt className="whitespace-pre-wrap font-mono text-xs text-accent">
                  {syntax}
                </dt>
                <dd className="text-fg-muted">{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-fg-muted">
            HTML is not interpreted — it appears as the text you typed. That is
            deliberate: it means a post can never inject markup into the page.
          </p>
        </details>

        {/*
          This row's own accent. Empty follows the site's, which is the
          default and the right answer for most rows — see
          `migrations/0016_entity_accents.sql`.
        */}
        <ColourField
          name="accent"
          label="Accent colour"
          value={values.accent}
          fallback={siteAccent}
          errors={fieldErrors.accent}
          hint="Used for this one's highlights on the public site. Leave it to follow the site accent."
          onChange={(value) => update("accent", value)}
        />
      </section>

      <section
        aria-labelledby={`${fieldId}-publishing`}
        className="flex flex-col gap-5"
      >
        <h2
          id={`${fieldId}-publishing`}
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Publishing
        </h2>

        <SelectField
          id={`${fieldId}-status`}
          name="status"
          label="Status"
          value={values.status}
          options={[
            { value: "draft", label: "Draft — only visible here" },
            { value: "published", label: "Published — live on the site" },
            { value: "archived", label: "Archived — taken down, kept here" },
          ]}
          errors={fieldErrors.status}
          hint="Only published notes appear on the site, in the list and in the sitemap. Draft and archived both 404 if someone guesses the URL."
          onChange={(value) => update("status", value)}
        />

        <TextField
          id={`${fieldId}-published`}
          name="publishedAt"
          label="Date"
          type="date"
          value={values.publishedAt}
          errors={fieldErrors.publishedAt}
          hint="The date the post claims. Leave empty and it falls back to the day you created it — so a published note is never undated."
          onChange={(value) => update("publishedAt", value)}
        />

        <TextField
          id={`${fieldId}-tags`}
          name="tags"
          label="Tags"
          value={values.tags}
          errors={fieldErrors.tags}
          hint="Comma separated, up to eight. Shown as chips; they don’t filter anything."
          onChange={(value) => update("tags", value)}
        />

        <MediaPickerField
          id={`${fieldId}-cover`}
          label="Cover image"
          value={values.coverMediaId}
          options={mediaOptions}
          errors={fieldErrors.coverMediaId}
          hint="Shown on the list card and when the note is shared. Optional — a note without one still reads fine."
          onChange={(value) => update("coverMediaId", value)}
        />

        <TextField
          id={`${fieldId}-position`}
          name="position"
          label="Position"
          type="number"
          min={0}
          value={String(values.position)}
          errors={fieldErrors.position}
          hint="Use this only to pin a post to the top. Leave it at 0 and notes sort newest first."
          onChange={(value) => update("position", Number(value))}
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
          href="/notes"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
