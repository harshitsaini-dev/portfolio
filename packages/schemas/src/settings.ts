/**
 * Site settings — the **untrusted-input** boundary for the theme CMS.
 *
 * Fields mirror the committed `site_settings` table and nothing more:
 *
 *   id (singleton) | site_name | site_description | default_theme |
 *   accent_color | social_image_id | is_contact_enabled | updated_at
 *
 * There is deliberately no separate create/update pair: the row's identity is
 * fixed by a CHECK constraint, so "create" and "update" are the same
 * operation. See `SiteSettingsRepository.upsert`.
 *
 * ## The accent is a colour, not CSS
 *
 * `accentColor` accepts a six-digit hex value and nothing else — not `red`,
 * not `rgb(...)`, not a custom property, not a `url()`. This is the one field
 * in the whole CMS whose value ends up influencing how the site is painted,
 * and the project's rule is explicit: the admin controls a **theme
 * configuration**, never arbitrary CSS. A narrow grammar here is what keeps
 * that true, and it is enforced again at the point of use, where the value is
 * set as an inline custom property rather than interpolated into a
 * stylesheet.
 *
 * Three-digit shorthand is rejected rather than expanded. Accepting it would
 * mean two representations of the same colour round-tripping differently
 * through the form, and there is no editor benefit worth that.
 */

import { z } from "zod";

import { SCENE_QUALITY_PRESETS, THEME_PREFERENCES } from "@portfolio/types";

import { mediaReferenceCreate } from "./internal/media-reference.ts";

/** Optional prose: blank input becomes `null` rather than an empty string. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

/**
 * The theme the site starts in, before any visitor preference.
 *
 * The values come from `@portfolio/types` rather than being restated here.
 * They are already the domain's list and the column's CHECK constraint; a
 * second copy is a second thing to keep in step, and `projects.ts` imports
 * its own enums the same way.
 */
export const themePreferenceSchema = z.enum(THEME_PREFERENCES);

/** `#rrggbb`, case-insensitive. Normalised to lowercase on the way in. */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const HEX_COLOR_MESSAGE = "Use a six-digit hex colour, e.g. #2547d0";

/**
 * The accent colour, or nothing.
 *
 * Blank becomes `null` rather than `""` — one representation for "use the
 * built-in accent", not two. A `""` reaching the renderer would set an empty
 * custom property, which is not the same as leaving it unset.
 */
export const accentColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine(
    (value) => value === null || HEX_COLOR_PATTERN.test(value),
    HEX_COLOR_MESSAGE,
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

export const siteSettingsSaveSchema = z
  .object({
    siteName: z.string().trim().min(1, "Required").max(120, "Too long"),
    siteDescription: optionalText(300),
    defaultTheme: themePreferenceSchema.default("system"),
    accentColor: accentColorSchema.default(null),
    /** The image used for link previews. */
    socialImageId: mediaReferenceCreate,
    /**
     * The browser-tab icon.
     *
     * A separate field from the social image on purpose: this is rendered at
     * 16-32px, where a preview card's composition and text are unreadable.
     */
    faviconMediaId: mediaReferenceCreate,
    // The footer line. Null keeps the composed "Built and maintained by
    // <name>." sentence, which is what the site showed before this existed.
    footerNote: nullableText(200).default(null),
    // The console easter egg. Null keeps the message the site has always
    // printed, so an owner who never opens these fields sees no change.
    //
    // The body is capped generously rather than tightly: it is read in a
    // devtools panel, where a paragraph is fine and where the only real limit
    // is the reader's patience.
    consoleHeadline: nullableText(120).default(null),
    consoleBody: nullableText(1000).default(null),
    isConsoleEnabled: z.boolean().default(true),
    isKonamiEnabled: z.boolean().default(true),
    isContactEnabled: z.boolean().default(true),
  })
  .strict();

export type SiteSettingsSaveInput = z.infer<typeof siteSettingsSaveSchema>;

/**
 * 3D scene settings.
 *
 * Every field is a **permission**, not an instruction. The browser makes the
 * final call after checking reduced motion, screen size and whether a WebGL
 * context can actually be created — so enabling the scene here means "allowed
 * to run", never "must run".
 *
 * The defaults match the column defaults, and both are off. A portfolio with
 * no 3D is the shipped state rather than a fallback.
 */
export const sceneSettingsSaveSchema = z
  .object({
    isEnabled: z.boolean().default(false),
    qualityPreset: z.enum(SCENE_QUALITY_PRESETS).default("balanced"),
    isMobileEnabled: z.boolean().default(false),
    /**
     * The figure's speech bubble.
     *
     * Defaults **true**, unlike its neighbours. They are off because the
     * scene as a whole is opt-in; this is a sub-feature of something
     * already opted into, so someone who switched the scene on has asked
     * for the figure, and the figure talking is part of it.
     */
    isSpeechEnabled: z.boolean().default(true),
    /**
     * Device-pixel-ratio ceiling.
     *
     * Bounded to match the column's CHECK. Above 2 the cost is real and the
     * difference is not: rendering at 4x means sixteen times the pixels of 1x
     * for a soft shape nobody is inspecting.
     */
    maxPixelRatio: z.number().min(0.5).max(4).default(2),
  })
  .strict();

export type SceneSettingsSaveInput = z.infer<typeof sceneSettingsSaveSchema>;
