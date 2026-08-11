import "server-only";

/**
 * The site accent, for the swatch a colour picker shows when nothing is set.
 *
 * ## Why this is its own read
 *
 * The forms that offer a per-row accent — a section, a note, a project — need
 * to show what "follow the site" actually looks like. The alternative was
 * showing the built-in token, which is a lie on any site whose owner has
 * changed the accent, and `#000000`, which is what a native colour input shows
 * for an empty value and is a worse lie still.
 *
 * It is not read in the protected layout. That file is the authorization
 * boundary, and a settings query in it would add a database read to every
 * admin page — including the ones with no colour picker on them — inside a
 * file whose job is security and nothing else.
 *
 * ## Failure is not an error here
 *
 * A swatch is decoration. If the settings row cannot be read, the picker falls
 * back to the built-in accent rather than the page failing: nobody should be
 * unable to edit a note because a colour could not be looked up.
 */

import { getAdminRepositories } from "@/lib/db/binding";

/**
 * The light-theme token from `packages/ui/src/tokens.css`.
 *
 * Duplicated rather than imported, because a CSS variable's value cannot be
 * read into TypeScript. If that token changes, this changes with it — one
 * line, and the only cost of not being able to import a stylesheet.
 */
export const DEFAULT_ACCENT = "#2547d0";

export async function getSiteAccent(): Promise<string> {
  try {
    const repos = await getAdminRepositories();
    const settings = await repos.siteSettings.get();
    return settings?.accentColor ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/**
 * A system screen's accent: its own, or the site's, or nothing.
 *
 * Separate from `getSiteAccent` because these pages are reached *without* an
 * identity — the denial page by definition, the 404 for any unknown URL. It
 * asks for one nullable colour and nothing else, and falls back rather than
 * failing. A hex is already visible in every pixel of the page it colours, so
 * there is nothing here that could leak.
 *
 * ## Why the 404 may afford a query and the public site's may not
 *
 * The public 404 deliberately reads nothing: an unknown URL is the most common
 * thing a scanner requests, and a missing page should not cost a query per
 * hit. That argument is much weaker here. This whole Worker sits behind
 * Cloudflare Access, so a scanner never reaches the application at all — it is
 * stopped at the edge, and the only person who sees this page is someone who
 * is already meant to be here.
 *
 * The error boundary still reads nothing, and that one is not about cost: it
 * catches a failure that may well *be* the database, and a settings query
 * inside it could throw the very error it is rendering.
 */
export async function getScreenAccent(
  screen: "denied" | "notFound",
): Promise<string | null> {
  try {
    const repos = await getAdminRepositories();
    const settings = await repos.siteSettings.get();
    return settings?.screenAccents[screen] ?? settings?.accentColor ?? null;
  } catch {
    return null;
  }
}
