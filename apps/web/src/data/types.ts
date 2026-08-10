import type { SectionCopy } from "@/lib/content/sections";

/**
 * VIEW MODELS for the public site.
 *
 * These are no longer the Phase 2 placeholder shapes. They are the models the
 * page's components render, built from `@portfolio/types` by
 * `@/lib/content/site-content.ts`.
 *
 * They stay separate from the domain model on purpose, because they answer a
 * different question. The domain has `startedOn` and `endedOn` as dates; a
 * timeline card shows one string, "2024 – present", and deciding what that
 * string says is a presentation concern. The domain has a join table of
 * technology rows; a project card shows their names. Collapsing the two would
 * either push formatting into the repository layer or push date arithmetic
 * into JSX, and both are worse than a mapping function.
 *
 * The rule they inherit from Phase 2 still holds: **do not import these
 * outside `apps/web`, and do not promote them to `packages/types`.** Nothing
 * here is shared with the admin, which renders the domain model directly.
 */

/**
 * A link that may not have a destination yet.
 *
 * Phase 2 has no real URLs to point at. Rather than inventing dead links,
 * an unavailable action is represented explicitly so the UI can render it
 * honestly (as disabled, with a reason) instead of misleading the reader.
 */
/**
 * A link that may not have a destination.
 *
 * Real content does not guarantee a URL: a project may have no repository, a
 * certification no public credential. Rather than rendering a dead link or
 * silently dropping the action, an unavailable one is represented explicitly
 * so the UI can say why it is disabled.
 *
 * Still named `PlaceholderLink` for the components that consume it; the
 * `unavailable` case now means "the editor supplied no URL" rather than
 * "this phase has no URLs yet".
 */
export type PlaceholderLink =
  | { readonly status: "available"; readonly href: string; readonly label: string }
  | { readonly status: "unavailable"; readonly label: string; readonly reason: string };

/**
 * An image the public site can render.
 *
 * `id` addresses `/media/[id]`; `alt` is the description the editor wrote.
 * Both or neither — an asset with no alt text is not renderable content, so
 * the mapper drops it rather than emitting an image a screen reader cannot
 * describe.
 */
export interface ContentImage {
  readonly id: string;
  readonly alt: string;
  /**
   * Intrinsic pixel dimensions, when the upload recorded them.
   *
   * Used to reserve the right box before the bytes arrive, so a page does not
   * reflow as images load. Null for an asset stored before dimensions were
   * captured — the image still renders, it just cannot reserve space.
   */
  readonly width: number | null;
  readonly height: number | null;
}

export interface Profile {
  /** The owner's photograph, if one was chosen and described. */
  readonly image: ContentImage | null;
  /**
   * The portrait revealed underneath by the hero's hover window.
   *
   * Null is the ordinary case, and the hero falls back to a drawn figure —
   * so this being absent costs a nicer effect, never the effect itself.
   */
  readonly xrayImage: ContentImage | null;
  readonly name: string;
  readonly role: string;
  /**
   * Alternative phrasings of `role`, in order, for the rotating label.
   *
   * `role` is NOT repeated here — it is the canonical first phrase, and these
   * follow it. Empty means no rotation, which is the default and renders
   * exactly as it did before rotation existed.
   */
  readonly roleAlternates: readonly string[];
  readonly tagline: string;
  readonly introduction: readonly string[];
  readonly location: string;
  readonly availability: string;
}

export interface Project {
  /** The small mark shown beside the title. */
  readonly image: ContentImage | null;
  /** The wide image at the head of the card, when the project has one. */
  readonly cover: ContentImage | null;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly technologies: readonly string[];
  readonly year: string;
  readonly repository: PlaceholderLink;
  readonly liveSite: PlaceholderLink;
}

export interface TimelineEntry {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly role: string;
  readonly organization: string;
  readonly period: string;
  readonly summary: string;
  readonly highlights: readonly string[];
}

export interface EducationEntry {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly qualification: string;
  readonly institution: string;
  readonly period: string;
  readonly summary: string;
}

export interface Certification {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly title: string;
  readonly issuer: string;
  readonly issued: string;
  readonly credential: PlaceholderLink;
}

/** A single skill, which may carry its own logo. */
export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly image: ContentImage | null;
}

export interface SkillCategory {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * Skills as objects rather than names.
   *
   * They were `string[]`, which quietly discarded the `icon_media_id` every
   * skill row has — the CMS could set a logo and the site had nowhere to put
   * it.
   */
  readonly skills: readonly Skill[];
}

export interface Tool {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
}

/**
 * A link to a profile elsewhere.
 *
 * `label` is what a visitor reads and what a screen reader announces, so it
 * is never omitted even when a logo is present — an icon-only link is
 * unusable without sight and ambiguous with it.
 */
export interface SocialProfile {
  readonly id: string;
  readonly label: string;
  readonly platform: string;
  readonly url: string;
  readonly image: ContentImage | null;
}

/** The current résumé, when one is published. */
export interface ResumeLink {
  readonly label: string;
  /** Points at `/media/[id]`, which serves the PDF inline. */
  readonly href: string;
}

export interface ContactCallToAction {
  readonly heading: string;
  readonly body: string;
  readonly primaryAction: PlaceholderLink;
  readonly secondaryAction: PlaceholderLink;
}

export interface NavigationItem {
  /** Must match the `id` of the corresponding <section> element. */
  readonly targetId: string;
  readonly label: string;
}

/** What the theme CMS controls, resolved for rendering. */
export interface SiteTheme {
  /** `light` or `dark` pins the page; `system` leaves it to the visitor. */
  readonly defaultTheme: "light" | "dark" | "system";
  /** `#rrggbb`, or null to use the built-in accent. */
  readonly accentColor: string | null;
  /**
   * The browser-tab icon, as a `/media/[id]` URL, or null for the built-in.
   *
   * Carries its content type too: a `<link rel="icon">` should declare it, and
   * the value comes from the row rather than being guessed from the URL,
   * which has no extension.
   */
  readonly favicon: { readonly href: string; readonly type: string } | null;
}

/**
 * What the 3D scene is allowed to do, from `scene_settings`.
 *
 * Every field is a permission rather than an instruction: the browser makes
 * the final call after checking reduced motion, screen size and whether a
 * WebGL context can actually be created.
 */
export interface SceneConfig {
  readonly isEnabled: boolean;
  readonly isMobileEnabled: boolean;
  /** Whether the figure's speech bubble may appear. */
  readonly isSpeechEnabled: boolean;
  readonly maxPixelRatio: number;
}

export interface SiteContent {
  readonly siteName: string;
  readonly scene: SceneConfig;
  readonly siteDescription: string | null;
  readonly theme: SiteTheme;
  /** Whether the contact section is shown at all. */
  readonly isContactEnabled: boolean;
  readonly socials: readonly SocialProfile[];
  readonly resume: ResumeLink | null;
  /**
   * The page's sections, already filtered to visible and sorted into render
   * order. The page maps over this rather than hardcoding a sequence.
   */
  readonly sections: readonly SectionCopy[];
  readonly navigation: readonly NavigationItem[];
  readonly profile: Profile;
  readonly projects: readonly Project[];
  readonly timeline: readonly TimelineEntry[];
  readonly education: readonly EducationEntry[];
  readonly certifications: readonly Certification[];
  readonly skillCategories: readonly SkillCategory[];
  readonly tools: readonly Tool[];
  /**
   * What the hero's robot can say, in display order.
   *
   * Strings rather than records: the bubble needs the text and nothing
   * else. The time-of-day greeting is not in here — it is computed from the
   * clock in India and cannot be stored.
   */
  readonly robotLines: readonly string[];
  readonly contact: ContactCallToAction;
  readonly footerNote: string;
}
