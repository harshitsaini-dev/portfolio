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
      { label: "Profile", availableIn: "Phase 8" },
      { label: "Experience", availableIn: "Phase 8" },
      { label: "Education", availableIn: "Phase 8" },
      { label: "Skills & tools", availableIn: "Phase 8" },
      { label: "Sections", availableIn: "Phase 8" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Media", availableIn: "Phase 9" },
      { label: "Settings", availableIn: "Phase 10" },
      { label: "Inbox", availableIn: "Phase 11" },
    ],
  },
];

/** Every route that actually exists, for link-integrity checks. */
export const ADMIN_ROUTES: readonly string[] = ADMIN_NAV.flatMap((group) =>
  group.items.flatMap((item) => (item.href ? [item.href] : [])),
);
