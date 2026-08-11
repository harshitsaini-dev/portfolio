/**
 * Page section mutation schemas.
 *
 * The **untrusted-input** boundary for sections, alongside the other entity
 * modules, and still separate from the row decoders in
 * `@portfolio/database`.
 *
 * Fields mirror the committed `sections` table and nothing more:
 *
 *   id | key (UNIQUE) | title | subtitle | eyebrow | position | is_visible
 *   | created_at | updated_at
 *
 * There is **no route, component, icon, page, slug, anchor, description,
 * layout, variant, theme, animation, background, 3D-settings, or media
 * column**, so none is validated here. `sections` has no foreign key in
 * either direction and nothing references it.
 *
 * ## `key` is a stable machine identifier, and it is immutable
 *
 * The migration says so directly — *"Stable machine key the UI maps to a
 * component, e.g. 'projects'"* — and the Phase 5 repository enforces it by
 * **omitting `key` from its patch allowlist**, with `SectionUpdate` in
 * `@portfolio/types` omitting it too. Renaming a key would silently
 * disconnect a section from the component that renders it.
 *
 * So `key` is set **once, on create**, and the update shape below does not
 * accept it. Because that shape is `.strict()`, an update carrying `key` is
 * **rejected** rather than accepted-and-ignored: a silently discarded field
 * looks to the caller like a rename that succeeded and did nothing. This is
 * the same stance the skills module takes with `categoryId`.
 *
 * ## Why `key` uses the canonical slug grammar
 *
 * Not invented here: `docs/DATABASE.md` lists `sections.key` under its
 * **Slugs** heading beside `projects`, `technologies`, and
 * `skill_categories`, all `TEXT NOT NULL UNIQUE` machine identifiers, and
 * the migration's own example (`projects`) is exactly that shape. So it
 * reuses `slugSchema` from `internal/slug.ts` rather than adding a fourth
 * grammar.
 *
 * **No enum.** The schema defines no closed set of keys — no CHECK, no
 * lookup table — so restricting the CMS to today's implemented components
 * would invent a constraint the database does not have and would block
 * adding a section before its component ships. Uniqueness stays the
 * database's.
 *
 * ## Create and update are declared separately
 *
 * `.partial()` does not neutralise `.default()`: a defaulted field is still
 * materialised when the key is absent, so a patch built that way silently
 * carries `position: 0`, `isVisible: true`, and `null` for every optional,
 * and the repository's patch allowlist then writes them. That cost the
 * timeline module a post-merge regression.
 */

import { z } from "zod";

import { accentColorSchema } from "./settings.ts";

import { slugSchema } from "./internal/slug.ts";

import {
  mediaReferenceCreate,
  mediaReferenceUpdate,
} from "./internal/media-reference.ts";

// ---------------------------------------------------------------------------
// Shared leaf schemas — no defaults, no optionality; the shapes add those.
// ---------------------------------------------------------------------------

const requiredText = (max: number) =>
  z.string().trim().min(1, "Required").max(max, "Too long");

/** Optional free text: blank input becomes `null`, not `""`. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

const positionValue = z
  .number()
  .int("Must be a whole number")
  .min(0, "Must be zero or more")
  .max(10_000, "Too large");

/**
 * Fields a caller may set when creating a section.
 *
 * `id`, `createdAt`, and `updatedAt` are **absent by design**, and
 * `.strict()` rejects a payload attempting to supply them.
 *
 * `key` is present here and **only** here. Its uniqueness is the database's:
 * `sections.key` is `NOT NULL UNIQUE`, and an application-level "is this
 * taken?" check would be a race the constraint already wins.
 */
export const sectionCreateSchema = z
  .object({
    iconMediaId: mediaReferenceCreate,
    key: slugSchema,
    title: requiredText(120),
    // Editorial copy shown beneath the title. Nullable in the schema, so
    // blank input becomes `null` rather than `""`.
    subtitle: nullableText(300).default(null),
    // Small label rendered above the title, e.g. "What I do".
    eyebrow: nullableText(80).default(null),
    /*
      This row's own accent, or null to follow the site's.

      Reuses `accentColorSchema` rather than declaring a looser rule: the
      argument that the admin controls a theme configuration and never
      arbitrary CSS applies here exactly as it does to the site accent.
    */
    accent: accentColorSchema.default(null),
    position: positionValue.default(0),
    isVisible: z.boolean().default(true),
  })
  .strict();

/**
 * An update patch: every field optional, **no defaults**, and **no `key`**.
 *
 * An absent key must stay absent so the repository's `buildPatch` skips the
 * column entirely. A caller retitling a section must not have `position` and
 * `isVisible` quietly rewritten underneath them.
 *
 * `key` is deliberately not a member of this object. Combined with
 * `.strict()`, that means an update payload containing `key` **fails
 * validation** — the only truthful outcome, since the repository cannot
 * write that column and the public UI depends on it never changing.
 */
export const sectionUpdateSchema = z
  .object({
    iconMediaId: mediaReferenceUpdate,
    title: requiredText(120).optional(),
    subtitle: nullableText(300).optional(),
    eyebrow: nullableText(80).optional(),
    accent: accentColorSchema.optional(),
    position: positionValue.optional(),
    isVisible: z.boolean().optional(),
  })
  .strict();

/**
 * Alternative phrasings for one rotating label.
 *
 * A list of plain strings, validated by the same bounds as the label they
 * follow — an alternate that could not be stored in `title` has no business
 * rotating in its place. Blank entries are rejected rather than trimmed away
 * silently, so an editor who leaves a row empty is told, not ignored.
 *
 * The canonical phrase is NOT a member: it stays in the section row. These
 * are the alternates appended after it.
 *
 * Bounded at 8. Not a database limit — a rotation nobody can follow is a
 * design failure, and by the ninth phrase a visitor has stopped reading.
 */
const alternateList = (max: number) =>
  z
    .array(z.string().trim().min(1, "Required").max(max, "Too long"))
    .max(8, "Too many alternates");

export const sectionAlternatesSchema = z
  .object({
    title: alternateList(120).default([]),
    eyebrow: alternateList(80).default([]),
  })
  .strict();

export type SectionAlternatesInput = z.infer<typeof sectionAlternatesSchema>;

export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

/** Identifies a section for update/delete. */
export const sectionIdSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(64, "Too long");
