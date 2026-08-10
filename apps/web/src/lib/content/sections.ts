import "server-only";

/**
 * Which sections the page can render, and in what order.
 *
 * The `sections` table lets an editor reorder the page, retitle a section and
 * hide one. It cannot invent a section: a row's `key` has to correspond to a
 * component that exists, and no CMS field can produce React. So the set of
 * renderable keys is declared here, in code, and the table decides what
 * happens to them.
 *
 * ## Rows override defaults; they do not replace them
 *
 * The tempting rule is "the table is the page" — render exactly the rows it
 * holds. It has a cliff in it: the table starts empty, so the first row an
 * editor creates would silently delete six sections from the site. Nobody
 * adding a "Projects" section expects About and Contact to vanish.
 *
 * So the defaults below are the page, and a row **overrides** the matching
 * key — its position, its title, its eyebrow, its visibility. Hiding a
 * section is `is_visible = 0`, which is exactly what that column is for;
 * deleting the row means "no override", not "no section".
 *
 * A row whose key matches nothing here is ignored. That is a real gap worth
 * naming: the admin's section form accepts any slug, so an editor can create
 * `key = "podcast"` and see nothing happen. Validating the key against this
 * list belongs in the admin, and is a follow-up rather than something to
 * paper over here by rendering an empty section.
 */

/** Every section this page knows how to render, in default page order. */
export const SECTION_KEYS = [
  "about",
  "projects",
  "experience",
  "education",
  "skills",
  "playground",
  "contact",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export interface SectionCopy {
  readonly key: SectionKey;
  readonly eyebrow: string;
  readonly title: string;
  /**
   * Alternative phrasings the two typed labels rotate through, in order.
   *
   * Neither list repeats the label above it: `eyebrow` and `title` are the
   * canonical first phrases. Empty is the default and the common case — a
   * section with no alternates renders exactly as it did before rotation
   * existed, with no client component involved at all.
   */
  readonly titleAlternates?: readonly string[];
  readonly eyebrowAlternates?: readonly string[];
  /** Shown in the page navigation. Shorter than the title. */
  readonly navLabel: string;
  /**
   * A single decorative marker rendered beside the eyebrow.
   *
   * **Always `aria-hidden` where it is rendered.** The heading beside it
   * already says what the section is, and a screen reader announcing
   * "rocket Projects" is worse than one announcing "Projects".
   *
   * Written as escapes rather than pasted characters so the file stays
   * unambiguous in a diff and cannot be mangled by an editor's encoding.
   *
   * Not editable from the CMS: there is no column for it, and one is not
   * worth a migration for a fixed six-item mapping. If an editor ever needs
   * to change these, that is the point to add one.
   */
  readonly marker: string;
}

/**
 * Editorial defaults.
 *
 * These are the one place the public site still holds visitor-facing copy in
 * code, and deliberately so: a page with an empty CMS still needs headings.
 * Every one of them is overridable from the admin, which is the distinction
 * `CLAUDE.md` draws — content is data, but a default is not the same as a
 * hardcoded value that cannot be changed.
 */
const DEFAULTS: Record<SectionKey, SectionCopy> = {
  about: {
    key: "about",
    eyebrow: "Profile",
    title: "About",
    navLabel: "About",
    marker: "\u{1F44B}",
  },
  projects: {
    key: "projects",
    eyebrow: "Selected work",
    title: "Projects",
    navLabel: "Projects",
    marker: "\u{1F680}",
  },
  experience: {
    key: "experience",
    eyebrow: "Career",
    title: "Experience",
    navLabel: "Experience",
    marker: "\u{1F4BC}",
  },
  education: {
    key: "education",
    eyebrow: "Background",
    title: "Education & certifications",
    navLabel: "Education",
    marker: "\u{1F393}",
  },
  skills: {
    key: "skills",
    eyebrow: "Capabilities",
    title: "Skills & tools",
    navLabel: "Skills",
    marker: "\u{1F9E0}",
  },
  playground: {
    key: "playground",
    eyebrow: "Interactive",
    title: "Contribution playground",
    navLabel: "Playground",
    marker: "\u{1F3AE}",
  },
  contact: {
    key: "contact",
    eyebrow: "Contact",
    title: "Get in touch",
    navLabel: "Contact",
    marker: "\u{1F4AC}",
  },
};

/** A row from the `sections` table, narrowed to what this module reads. */
interface SectionRow {
  readonly key: string;
  readonly title: string;
  readonly eyebrow: string | null;
  readonly position: number;
  readonly isVisible: boolean;
  /**
   * Alternative phrasings for the two labels that type themselves out.
   *
   * Neither list repeats the stored label: `title` and `eyebrow` above are the
   * canonical first phrases, and these follow them.
   */
  readonly titleAlternates?: readonly string[];
  readonly eyebrowAlternates?: readonly string[];
}

function isSectionKey(key: string): key is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(key);
}

/**
 * Resolve the page's sections from the stored rows.
 *
 * Returns only visible sections, in the order the page should render them.
 * Rows are matched by key; unmatched defaults keep their declared order
 * relative to each other and sort after any row that was given a position.
 */
export function resolveSections(rows: readonly SectionRow[]): SectionCopy[] {
  const overrides = new Map<SectionKey, SectionRow>();
  for (const row of rows) {
    // Last row wins for a duplicate key. The column is UNIQUE, so this is
    // defensive rather than expected.
    if (isSectionKey(row.key)) overrides.set(row.key, row);
  }

  return SECTION_KEYS.map((key, index) => {
    const override = overrides.get(key);
    const copy = DEFAULTS[key];
    return {
      copy: override
        ? {
            key,
            // An empty title would render a heading with nothing in it, so
            // the default stands in. The schema requires a title, so this is
            // defensive rather than expected.
            title: override.title.trim() || copy.title,
            eyebrow: override.eyebrow?.trim() || copy.eyebrow,
            navLabel: override.title.trim() || copy.navLabel,
            // Alternates ride with the copy. Blank entries are dropped here
            // rather than in the component: an empty phrase would type
            // nothing and read as the label vanishing.
            titleAlternates: (override.titleAlternates ?? [])
              .map((text) => text.trim())
              .filter((text) => text.length > 0),
            eyebrowAlternates: (override.eyebrowAlternates ?? [])
              .map((text) => text.trim())
              .filter((text) => text.length > 0),
            // The marker stays with the key rather than the row: it says
            // which section this is, not what the editor called it.
            marker: copy.marker,
          }
        : copy,
      visible: override ? override.isVisible : true,
      // Rows carry an explicit position. Sections with no row sort after
      // them, keeping their declared order among themselves — a large offset
      // rather than a magic number chosen to look tidy.
      position: override ? override.position : SECTION_KEYS.length + index,
    };
  })
    .filter((entry) => entry.visible)
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.copy);
}
