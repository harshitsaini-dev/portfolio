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
}

export interface Profile {
  /** The owner's photograph, if one was chosen and described. */
  readonly image: ContentImage | null;
  readonly name: string;
  readonly role: string;
  readonly tagline: string;
  readonly introduction: readonly string[];
  readonly location: string;
  readonly availability: string;
}

export interface Project {
  /** The small mark shown beside the title. */
  readonly image: ContentImage | null;
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

export interface SkillCategory {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly string[];
}

export interface Tool {
  readonly image: ContentImage | null;
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
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

export interface SiteContent {
  readonly siteName: string;
  readonly navigation: readonly NavigationItem[];
  readonly profile: Profile;
  readonly projects: readonly Project[];
  readonly timeline: readonly TimelineEntry[];
  readonly education: readonly EducationEntry[];
  readonly certifications: readonly Certification[];
  readonly skillCategories: readonly SkillCategory[];
  readonly tools: readonly Tool[];
  readonly contact: ContactCallToAction;
  readonly footerNote: string;
}
