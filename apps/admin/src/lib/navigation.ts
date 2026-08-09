/**
 * Admin navigation model.
 *
 * Sections that Phase 6 has not built are listed but marked unavailable
 * rather than linked. A nav item pointing at a 404, or at a convincing
 * empty screen that looks like a broken CMS, is worse than an honest
 * "not built yet" — so unavailable items render as disabled text with the
 * phase that will deliver them.
 *
 * This is application structure, not admin-editable content: it describes
 * which screens the CMS *has*, which is a code concern. Editable page
 * sections live in the `sections` table and are managed through the CMS.
 */

export interface AdminNavItem {
  readonly label: string;
  /** Present only when the route actually exists. */
  readonly href?: string;
  /** Explains when an unavailable section arrives. */
  readonly availableIn?: string;
}

export interface AdminNavGroup {
  readonly heading: string;
  readonly items: readonly AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", href: "/" }],
  },
  {
    heading: "Content",
    items: [
      { label: "Projects", href: "/projects" },
      // Technologies is its own table, and is what the projects picker reads.
      // It is deliberately NOT merged into a "Skills & tools" label:
      // `technologies`, `skills`, `skill_categories`, and `tools` are four
      // unrelated tables, and one combined entry would imply a relationship
      // the schema does not have.
      { label: "Technologies", href: "/technologies" },
      { label: "Profile", href: "/profile" },
      // "Experience" matches the public site's and docs' wording for the
      // `timeline_entries` table; the route keeps the table's name.
      { label: "Experience", href: "/timeline" },
      { label: "Education", href: "/education" },
      { label: "Certifications", href: "/certifications" },
      // Skills and skill categories are one editing surface — a skill cannot
      // exist without a category — so they share a single nav entry, with
      // categories reached from inside the area rather than from here.
      // `tools` is a separate table and keeps its own entry: nothing relates
      // the two, so folding them together would imply a link that does not
      // exist in the schema.
      { label: "Skills", href: "/skills" },
      { label: "Tools", href: "/tools" },
      // `social_links` is its own flat table with no relationship to any
      // other entity, so it gets its own entry like the rest.
      { label: "Social links", href: "/socials" },
      // `sections` controls the public page's ordering, headings, and
      // visibility. Each row carries a stable `key` the site maps to a
      // component; the CMS manages the rows, not the components.
      { label: "Sections", href: "/sections" },
      // Grouped with content rather than with settings: the on/off switch
      // is a setting, but the sentences themselves are copy, and copy is
      // edited where the rest of the copy is.
      { label: "Robot lines", href: "/robot-lines" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Media", href: "/media" },
      // Beside Media rather than under Content: a resume is a file with a
      // publish switch, and the file it points at is uploaded next door.
      { label: "Resumes", href: "/resumes" },
      { label: "Settings", href: "/settings" },
      { label: "Inbox", href: "/inbox" },
    ],
  },
];

/** Every route that actually exists, for link-integrity checks. */
export const ADMIN_ROUTES: readonly string[] = ADMIN_NAV.flatMap((group) =>
  group.items.flatMap((item) => (item.href ? [item.href] : [])),
);
