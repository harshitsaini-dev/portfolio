/**
 * PHASE 2 TEMPORARY CONTENT TYPES.
 *
 * These shapes exist only so the Phase 2 static portfolio can render from a
 * single data source instead of scattering copy through JSX. They are NOT
 * the project's domain model.
 *
 * They will be REPLACED — not extended — by `@portfolio/types` and
 * `@portfolio/schemas` once the D1 schema (Phase 4) and repository/data
 * layer (Phase 5) exist. Field names deliberately echo the planned entities
 * in `docs/DATABASE.md` so that swap is mechanical, but nothing here implies
 * a database, repository, or validation layer exists today.
 *
 * Do not import these types outside `apps/web`, and do not promote them to
 * `packages/types`.
 */

/**
 * A link that may not have a destination yet.
 *
 * Phase 2 has no real URLs to point at. Rather than inventing dead links,
 * an unavailable action is represented explicitly so the UI can render it
 * honestly (as disabled, with a reason) instead of misleading the reader.
 */
export type PlaceholderLink =
  | { readonly status: "available"; readonly href: string; readonly label: string }
  | { readonly status: "unavailable"; readonly label: string; readonly reason: string };

export interface Profile {
  readonly name: string;
  readonly role: string;
  readonly tagline: string;
  readonly introduction: readonly string[];
  readonly location: string;
  readonly availability: string;
}

export interface Project {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly technologies: readonly string[];
  readonly year: string;
  readonly repository: PlaceholderLink;
  readonly liveSite: PlaceholderLink;
}

export interface TimelineEntry {
  readonly id: string;
  readonly role: string;
  readonly organization: string;
  readonly period: string;
  readonly summary: string;
  readonly highlights: readonly string[];
}

export interface EducationEntry {
  readonly id: string;
  readonly qualification: string;
  readonly institution: string;
  readonly period: string;
  readonly summary: string;
}

export interface Certification {
  readonly id: string;
  readonly title: string;
  readonly issuer: string;
  readonly issued: string;
  readonly credential: PlaceholderLink;
}

export interface SkillCategory {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly string[];
}

export interface Tool {
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
