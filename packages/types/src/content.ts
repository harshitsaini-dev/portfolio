/**
 * Portfolio content domain types.
 *
 * These are the shapes the rest of the system speaks in. They are NOT
 * database rows: rows are a private concern of `@portfolio/database`, which
 * decodes them into these types at its boundary (integer 0/1 becomes
 * `boolean`, absent columns become `null`, and so on).
 *
 * Three shapes exist per entity, deliberately kept distinct:
 *
 *   * `X`          — the domain entity, as read. Includes database-managed
 *                    fields (`id`, `createdAt`, `updatedAt`).
 *   * `XCreate`    — what a caller may supply when creating. Excludes
 *                    database-managed fields; the repository assigns them.
 *   * `XUpdate`    — a patch. Every field optional; `undefined` means "not
 *                    provided", while `null` on a nullable field means
 *                    "explicitly clear this value".
 */

/** ISO-8601 UTC timestamp, e.g. `2026-08-06T12:34:56.789Z`. */
export type IsoTimestamp = string;

/** Fields every persisted entity carries. */
export interface EntityMeta {
  readonly id: string;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Profile (singleton-key)
// ---------------------------------------------------------------------------

export interface Profile extends EntityMeta {
  /**
   * Optional profile photograph, referencing `media_assets`.
   * `ON DELETE SET NULL`: deleting the image clears the reference.
   */
  readonly avatarMediaId: string | null;
  /**
   * The portrait shown *under* the avatar, revealed through the hero's hover
   * window. Also `ON DELETE SET NULL`.
   *
   * A second column rather than a variant of the avatar, because the site
   * never chooses between the two — it composites one over the other, and
   * each carries its own alt text. Null is the common case, and the hero
   * falls back to a generated figure.
   */
  readonly xrayMediaId: string | null;
  readonly fullName: string;
  readonly headline: string;
  readonly tagline: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly availability: string | null;
  readonly publicEmail: string | null;
}

export interface ProfileInput {
  readonly avatarMediaId?: string | null;
  readonly xrayMediaId?: string | null;
  readonly fullName: string;
  readonly headline: string;
  readonly tagline?: string | null;
  readonly bio?: string | null;
  readonly location?: string | null;
  readonly availability?: string | null;
  readonly publicEmail?: string | null;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export interface MediaAsset extends EntityMeta {
  /** Object key within the R2 bucket. Binary data itself lives in R2. */
  readonly storageKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly checksum: string | null;
  readonly altText: string | null;
}

export interface MediaAssetCreate {
  readonly storageKey: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly checksum?: string | null;
  readonly altText?: string | null;
}

export interface MediaAssetUpdate {
  readonly contentType?: string;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly checksum?: string | null;
  readonly altText?: string | null;
}

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

export interface SocialLink extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly label: string;
  readonly platform: string;
  readonly url: string;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface SocialLinkCreate {
  readonly iconMediaId?: string | null;
  readonly label: string;
  readonly platform: string;
  readonly url: string;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export interface SocialLinkUpdate {
  readonly iconMediaId?: string | null;
  readonly label?: string;
  readonly platform?: string;
  readonly url?: string;
  readonly position?: number;
  readonly isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Résumés
// ---------------------------------------------------------------------------

export interface Resume extends EntityMeta {
  readonly label: string;
  readonly mediaAssetId: string;
  readonly isCurrent: boolean;
  readonly isVisible: boolean;
}

export interface ResumeCreate {
  readonly label: string;
  readonly mediaAssetId: string;
  readonly isCurrent?: boolean;
  readonly isVisible?: boolean;
}

export interface ResumeUpdate {
  readonly label?: string;
  readonly mediaAssetId?: string;
  readonly isCurrent?: boolean;
  readonly isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Technologies
// ---------------------------------------------------------------------------

export interface Technology extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly category: string | null;
}

export interface TechnologyCreate {
  readonly iconMediaId?: string | null;
  readonly name: string;
  readonly slug: string;
  readonly category?: string | null;
}

export interface TechnologyUpdate {
  readonly iconMediaId?: string | null;
  readonly name?: string;
  readonly slug?: string;
  readonly category?: string | null;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * A written note.
 *
 * Statuses are `PROJECT_STATUSES` deliberately reused rather than a parallel
 * list: an editor should learn "draft / published / archived" once, and two
 * lists that mean the same thing are two lists that can drift.
 */
export interface Note extends EntityMeta {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  /** Markdown. Rendered by an explicit parser, never as raw HTML. */
  readonly body: string;
  readonly status: ProjectStatus;
  /** ISO-8601, or null while unpublished. */
  readonly publishedAt: string | null;
  readonly coverMediaId: string | null;
  readonly tags: readonly string[];
  readonly position: number;
}

export interface NoteCreate {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly status: ProjectStatus;
  readonly publishedAt: string | null;
  readonly coverMediaId: string | null;
  readonly tags: readonly string[];
  readonly position: number;
}

export interface NoteUpdate {
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly body?: string;
  readonly status?: ProjectStatus;
  readonly publishedAt?: string | null;
  readonly coverMediaId?: string | null;
  readonly tags?: readonly string[];
  readonly position?: number;
}

export const PROJECT_STATUSES = ["draft", "published", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_LINK_KINDS = [
  "repository",
  "live",
  "case_study",
  "documentation",
  "package",
  "other",
] as const;
export type ProjectLinkKind = (typeof PROJECT_LINK_KINDS)[number];

export interface ProjectLink {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly url: string;
  readonly kind: ProjectLinkKind;
  readonly position: number;
}

export interface ProjectLinkInput {
  readonly label: string;
  readonly url: string;
  readonly kind?: ProjectLinkKind;
  readonly position?: number;
}

export interface ProjectMediaItem {
  readonly id: string;
  readonly projectId: string;
  readonly mediaAssetId: string;
  readonly caption: string | null;
  readonly position: number;
}

export interface ProjectMediaInput {
  readonly mediaAssetId: string;
  readonly caption?: string | null;
  readonly position?: number;
}

/**
 * How a project aggregate references one media asset.
 *
 * Two counts rather than one boolean because the two relations have different
 * delete rules and different remedies: `project_media` is `ON DELETE RESTRICT`
 * and the editor must detach the attachment, while `projects.cover_media_id`
 * is `ON DELETE SET NULL` — the database would allow the delete and silently
 * clear the cover, so the application has to refuse first.
 */
export interface ProjectMediaReferenceCounts {
  /** Projects using the asset as their cover image (`cover_media_id`). */
  readonly covers: number;
  /** Rows in `project_media` attaching the asset to a project. */
  readonly attachments: number;
}

export interface Project extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string | null;
  /**
   * Case-study prose: what was wrong, what was built, what was learned.
   *
   * Separate from `description` so the page can label and order them, and so
   * an unanswered one renders as nothing rather than an empty heading. The
   * stack is not here — it is the `technologies` relation.
   */
  readonly problem: string | null;
  readonly solution: string | null;
  readonly learnings: string | null;
  readonly status: ProjectStatus;
  readonly isFeatured: boolean;
  readonly position: number;
  readonly periodLabel: string | null;
  readonly startedOn: string | null;
  readonly completedOn: string | null;
  readonly coverMediaId: string | null;
  readonly publishedAt: IsoTimestamp | null;
}

/** A project together with its owned relationships. */
export interface ProjectWithRelations extends Project {
  readonly links: readonly ProjectLink[];
  readonly media: readonly ProjectMediaItem[];
  readonly technologies: readonly Technology[];
}

export interface ProjectCreate {
  readonly iconMediaId?: string | null;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description?: string | null;
  readonly problem?: string | null;
  readonly solution?: string | null;
  readonly learnings?: string | null;
  readonly status?: ProjectStatus;
  readonly isFeatured?: boolean;
  readonly position?: number;
  readonly periodLabel?: string | null;
  readonly startedOn?: string | null;
  readonly completedOn?: string | null;
  readonly coverMediaId?: string | null;
  readonly publishedAt?: IsoTimestamp | null;
}

export interface ProjectUpdate {
  readonly iconMediaId?: string | null;
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly description?: string | null;
  readonly problem?: string | null;
  readonly solution?: string | null;
  readonly learnings?: string | null;
  readonly status?: ProjectStatus;
  readonly isFeatured?: boolean;
  readonly position?: number;
  readonly periodLabel?: string | null;
  readonly startedOn?: string | null;
  readonly completedOn?: string | null;
  readonly coverMediaId?: string | null;
  readonly publishedAt?: IsoTimestamp | null;
}

export interface ProjectListOptions {
  /** Restrict to these statuses. Omit for all statuses (admin view). */
  readonly statuses?: readonly ProjectStatus[];
  readonly featuredOnly?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineHighlight {
  readonly id: string;
  readonly timelineEntryId: string;
  readonly content: string;
  readonly position: number;
}

export interface TimelineEntry extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly role: string;
  readonly organization: string;
  readonly summary: string | null;
  readonly location: string | null;
  readonly periodLabel: string | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface TimelineEntryWithHighlights extends TimelineEntry {
  readonly highlights: readonly TimelineHighlight[];
}

export interface TimelineEntryCreate {
  readonly iconMediaId?: string | null;
  readonly role: string;
  readonly organization: string;
  readonly summary?: string | null;
  readonly location?: string | null;
  readonly periodLabel?: string | null;
  readonly startedOn?: string | null;
  readonly endedOn?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export interface TimelineEntryUpdate {
  readonly iconMediaId?: string | null;
  readonly role?: string;
  readonly organization?: string;
  readonly summary?: string | null;
  readonly location?: string | null;
  readonly periodLabel?: string | null;
  readonly startedOn?: string | null;
  readonly endedOn?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Education & certifications
// ---------------------------------------------------------------------------

export interface EducationEntry extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly qualification: string;
  readonly institution: string;
  readonly fieldOfStudy: string | null;
  readonly summary: string | null;
  readonly periodLabel: string | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface EducationEntryCreate {
  readonly iconMediaId?: string | null;
  readonly qualification: string;
  readonly institution: string;
  readonly fieldOfStudy?: string | null;
  readonly summary?: string | null;
  readonly periodLabel?: string | null;
  readonly startedOn?: string | null;
  readonly endedOn?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type EducationEntryUpdate = Partial<EducationEntryCreate>;

export interface Certification extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly title: string;
  readonly issuer: string;
  readonly credentialId: string | null;
  readonly credentialUrl: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface CertificationCreate {
  readonly iconMediaId?: string | null;
  readonly title: string;
  readonly issuer: string;
  readonly credentialId?: string | null;
  readonly credentialUrl?: string | null;
  readonly issuedOn?: string | null;
  readonly expiresOn?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type CertificationUpdate = Partial<CertificationCreate>;

// ---------------------------------------------------------------------------
// Skills & tools
// ---------------------------------------------------------------------------

export interface SkillCategory extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface SkillCategoryCreate {
  readonly iconMediaId?: string | null;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type SkillCategoryUpdate = Partial<SkillCategoryCreate>;

export interface Skill extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly categoryId: string;
  readonly name: string;
  readonly proficiency: number | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface SkillCreate {
  readonly iconMediaId?: string | null;
  readonly categoryId: string;
  readonly name: string;
  readonly proficiency?: number | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export interface SkillUpdate {
  readonly iconMediaId?: string | null;
  readonly name?: string;
  readonly proficiency?: number | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export interface SkillCategoryWithSkills extends SkillCategory {
  readonly skills: readonly Skill[];
}

export interface Tool extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  readonly name: string;
  readonly purpose: string | null;
  readonly url: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface ToolCreate {
  readonly iconMediaId?: string | null;
  readonly name: string;
  readonly purpose?: string | null;
  readonly url?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type ToolUpdate = Partial<ToolCreate>;

// ---------------------------------------------------------------------------
// Robot lines
// ---------------------------------------------------------------------------

/**
 * One thing the hero's robot can say.
 *
 * The plainest entity in the schema on purpose: a sentence, an order and a
 * visibility flag. No category, no weight, no scheduling — none of which is
 * needed to say a sentence, and every speculative field is one more thing to
 * keep true.
 *
 * The time-of-day greeting is deliberately **not** one of these. It has to be
 * computed from the clock in India, and a stored row saying "good morning"
 * would be wrong for most of the day.
 */
export interface RobotLine extends EntityMeta {
  readonly text: string;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface RobotLineCreate {
  readonly text: string;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type RobotLineUpdate = Partial<RobotLineCreate>;

// ---------------------------------------------------------------------------
// Terminal lines
// ---------------------------------------------------------------------------

/**
 * A terminal line's tone, which decides its colour.
 *
 * `system` is the machine narrating itself; `speech` is the machine talking
 * about the person. Closed, because the component maps each to a colour token
 * and a third value would be a row nothing knows how to paint.
 */
export const TERMINAL_LINE_TONES = ["system", "speech"] as const;
export type TerminalLineTone = (typeof TERMINAL_LINE_TONES)[number];

/** One line printed by the console beside the hero robot. */
export interface TerminalLine extends EntityMeta {
  readonly text: string;
  readonly tone: TerminalLineTone;
  /** The short right-aligned word (`ok`) shown when the line is a step. */
  readonly status: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface TerminalLineCreate {
  readonly text: string;
  readonly tone?: TerminalLineTone;
  readonly status?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type TerminalLineUpdate = Partial<TerminalLineCreate>;

// ---------------------------------------------------------------------------
// Rotating labels (Phase 23)
// ---------------------------------------------------------------------------
//
// Three labels on the public site are typed out rather than printed, and each
// may cycle through alternatives: the hero headline, and a section's eyebrow
// and title.
//
// The FIRST phrase of every rotation is not modelled here. It stays in
// `profile.headline`, `sections.title` and `sections.eyebrow` — these are
// alternates appended after it, so a site with none behaves exactly as it did
// before the feature existed, and the canonical label a crawler indexes and a
// screen reader announces never depends on a timer.

/** One alternative phrasing of the hero headline. */
export interface HeadlineAlternate extends EntityMeta {
  readonly text: string;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface HeadlineAlternateCreate {
  readonly text: string;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export type HeadlineAlternateUpdate = Partial<HeadlineAlternateCreate>;

/** Which of a section's two rotating labels an alternate belongs to. */
export const SECTION_ALTERNATE_FIELDS = ["title", "eyebrow"] as const;
export type SectionAlternateField = (typeof SECTION_ALTERNATE_FIELDS)[number];

/**
 * A section's alternates, grouped by the label they belong to.
 *
 * Grouped rather than a flat list because every consumer wants one field's
 * rotation at a time — the public site renders them separately, and the admin
 * edits them as two lists.
 */
export interface SectionAlternates {
  readonly title: readonly string[];
  readonly eyebrow: readonly string[];
}

/** A section together with its rotating-label alternates. */
export interface SectionWithAlternates extends Section {
  readonly alternates: SectionAlternates;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface Section extends EntityMeta {
  /**
   * Optional icon, referencing `media_assets`. `ON DELETE SET NULL`:
   * deleting the image clears the reference and leaves the row intact.
   */
  readonly iconMediaId: string | null;
  /** Stable machine key the UI maps to a component, e.g. `projects`. */
  readonly key: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly eyebrow: string | null;
  readonly position: number;
  readonly isVisible: boolean;
}

export interface SectionCreate {
  readonly iconMediaId?: string | null;
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly eyebrow?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

export interface SectionUpdate {
  readonly iconMediaId?: string | null;
  readonly title?: string;
  readonly subtitle?: string | null;
  readonly eyebrow?: string | null;
  readonly position?: number;
  readonly isVisible?: boolean;
}

// ---------------------------------------------------------------------------
// Settings (singleton-key)
// ---------------------------------------------------------------------------

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface SiteSettings {
  /**
   * The footer line, when the editor has written one.
   *
   * Null means the site composes "Built and maintained by <name>." from the
   * profile, which is what it always did.
   */
  readonly footerNote: string | null;
  /**
   * The browser-tab icon, referencing `media_assets`.
   *
   * Separate from `socialImageId`: a favicon is rendered at 16–32px, where a
   * social preview's composition and text are unreadable.
   */
  readonly faviconMediaId: string | null;
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly defaultTheme: ThemePreference;
  readonly accentColor: string | null;
  readonly socialImageId: string | null;
  readonly isContactEnabled: boolean;
  readonly updatedAt: IsoTimestamp;
}

export interface SiteSettingsInput {
  /** Overrides the composed "Built and maintained by …" footer line. */
  readonly footerNote?: string | null;
  readonly faviconMediaId?: string | null;
  readonly siteName: string;
  readonly siteDescription?: string | null;
  readonly defaultTheme?: ThemePreference;
  readonly accentColor?: string | null;
  readonly socialImageId?: string | null;
  readonly isContactEnabled?: boolean;
}

export const SCENE_QUALITY_PRESETS = ["low", "balanced", "high"] as const;
export type SceneQualityPreset = (typeof SCENE_QUALITY_PRESETS)[number];

export interface SceneSettings {
  readonly isEnabled: boolean;
  readonly qualityPreset: SceneQualityPreset;
  readonly isMobileEnabled: boolean;
  /**
   * Whether the figure's speech bubble may appear.
   *
   * A sub-feature of the scene, not an independent one: the bubble is
   * positioned from the figure's projected screen coordinates, so with no
   * scene there is nothing to pin it to.
   */
  readonly isSpeechEnabled: boolean;
  readonly maxPixelRatio: number;
  readonly updatedAt: IsoTimestamp;
}

export interface SceneSettingsInput {
  readonly isEnabled?: boolean;
  readonly qualityPreset?: SceneQualityPreset;
  readonly isMobileEnabled?: boolean;
  readonly isSpeechEnabled?: boolean;
  readonly maxPixelRatio?: number;
}

// ---------------------------------------------------------------------------
// Contact messages
// ---------------------------------------------------------------------------

export const CONTACT_MESSAGE_STATUSES = [
  "unread",
  "read",
  "archived",
  "spam",
] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

export interface ContactMessage {
  readonly id: string;
  readonly senderName: string;
  readonly senderEmail: string;
  readonly subject: string | null;
  readonly body: string;
  readonly status: ContactMessageStatus;
  /** Coarse origin for abuse review. No IP address is ever stored. */
  readonly sourceCountry: string | null;
  readonly createdAt: IsoTimestamp;
  readonly readAt: IsoTimestamp | null;
}

export interface ContactMessageCreate {
  readonly senderName: string;
  readonly senderEmail: string;
  readonly subject?: string | null;
  readonly body: string;
  readonly sourceCountry?: string | null;
}

export interface ContactMessageListOptions {
  readonly statuses?: readonly ContactMessageStatus[];
  readonly limit?: number;
  readonly offset?: number;
}
