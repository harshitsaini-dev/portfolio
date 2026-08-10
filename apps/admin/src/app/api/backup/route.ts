/**
 * A downloadable snapshot of everything in the CMS.
 *
 * ## Why this exists
 *
 * Every word of the portfolio lives in one D1 database and there was no way to
 * get a copy of it out. One mistaken delete, one bad migration, and the
 * content is gone with nothing to restore from — the site's *code* is in git
 * and its *content* was not backed up anywhere.
 *
 * This is deliberately the modest version: a JSON file the owner can download
 * and keep. It is not a restore mechanism, and it does not pretend to be one.
 * A file in hand is the difference between "retype everything" and "paste it
 * back", and that difference is worth one route.
 *
 * ## It goes through the repositories, like everything else
 *
 * No raw SQL and no table dump. That costs a little verbosity and buys the
 * property that the export always matches the shape the application actually
 * uses — a `SELECT *` would faithfully export columns that no longer mean what
 * they used to, and would silently gain new ones nothing has read.
 *
 * ## Authentication is explicit here
 *
 * A route handler is **not** inside the protected layout, so nothing
 * authenticates it for free. `requireAdminIdentity()` is therefore called
 * first, before any read — this endpoint returns the entire contents of the
 * CMS, which makes it the single most sensitive URL in the app.
 *
 * ## Contact messages are included, on the owner's instruction
 *
 * They were excluded in the first version of this route, on the reasoning that
 * a backup of the owner's own content has no business carrying other people's
 * email addresses, and that a file on a laptop is where personal data should
 * not accumulate. The owner asked for them, which settles it: it is their
 * inbox, and a backup that loses every enquiry is not the backup they wanted.
 *
 * The reasoning is recorded rather than deleted, because it is still the
 * reason this file should be treated as sensitive wherever it is stored. The
 * response is `no-store, private` and the route is the most access-controlled
 * URL in the app.
 *
 * ## Media: every record, and a URL for every file
 *
 * The image *bytes* are still not inlined. Base64 in JSON is a third larger
 * than the file it encodes, and a portfolio's images would turn a 50KB
 * download into hundreds of megabytes assembled in a Worker's memory — a
 * request that would run out of memory rather than complete.
 *
 * Instead each media record carries a `downloadUrl` pointing at the public
 * site's `/media/[id]`, so the manifest is enough to fetch every file. A real
 * archive of the bytes is a different feature — a streamed ZIP — and worth
 * building only if this proves not to be enough.
 *
 * ## What is still excluded
 *
 * **Analytics.** Aggregate day counts that would be misleading if restored
 * into a different day's data, and which nobody would miss.
 */

import { NextResponse } from "next/server";

import { AdminUnauthorizedError, requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import { getPublicSiteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

/**
 * Bumped when the shape changes in a way a reader must notice.
 *
 * A backup with no version is a file whose format has to be guessed from its
 * contents the day it is needed, which is the worst possible day to guess.
 */
const BACKUP_FORMAT_VERSION = 1;

export async function GET(): Promise<Response> {
  // Before anything is read. See the header.
  try {
    await requireAdminIdentity();
  } catch (error) {
    // An uncaught throw here would fail closed too — but as a 500, which
    // reads as "the server is broken" rather than "you are not allowed", and
    // which renders an error page instead of a status a caller can act on.
    //
    // The reason is deliberately not echoed. `AdminUnauthorizedError` carries
    // *why* the token was rejected — expired, wrong audience, absent — and
    // telling an unauthenticated caller which of those it was is telling them
    // how to get closer next time.
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    throw error;
  }

  const repos = await getAdminRepositories();

  const [
    profile,
    siteSettings,
    sceneSettings,
    sections,
    projects,
    technologies,
    timeline,
    education,
    certifications,
    skills,
    tools,
    socialLinks,
    robotLines,
    terminalLines,
    headlineAlternates,
    media,
    resumes,
    contactMessages,
  ] = await Promise.all([
    repos.profile.get(),
    repos.siteSettings.get(),
    repos.sceneSettings.get(),
    repos.sections.list(),
    repos.projects.listWithRelations(),
    repos.technologies.list(),
    repos.timeline.listWithHighlights(),
    repos.education.list(),
    repos.certifications.list(),
    repos.skills.listWithSkills(),
    repos.tools.list(),
    repos.socialLinks.list(),
    repos.robotLines.list(),
    repos.terminalLines.list(),
    repos.headlineAlternates.list(),
    repos.media.list(),
    repos.resumes.list(),
    repos.contactMessages.list(),
  ]);

  // Where the bytes actually are. Built from the public site's origin because
  // that is the app that serves `/media/[id]`; the admin does not.
  const siteOrigin = getPublicSiteOrigin();
  const mediaWithUrls = media.map((asset) => ({
    ...asset,
    // Null rather than a guessed origin when it is not configured. A URL that
    // looks right and 404s is worse than an honestly absent one.
    downloadUrl: siteOrigin
      ? `${siteOrigin}/media/${encodeURIComponent(asset.id)}`
      : null,
  }));

  const backup = {
    formatVersion: BACKUP_FORMAT_VERSION,
    // Stamped by the server, in UTC, so two backups sort correctly regardless
    // of where they were downloaded.
    exportedAt: new Date().toISOString(),
    content: {
      profile,
      siteSettings,
      sceneSettings,
      sections,
      projects,
      technologies,
      timeline,
      education,
      certifications,
      skills,
      tools,
      socialLinks,
      robotLines,
      terminalLines,
      headlineAlternates,
      // Records plus a `downloadUrl` each; the bytes stay in R2. See header.
      media: mediaWithUrls,
      resumes,
      // Included on the owner's instruction — see the header, and treat the
      // resulting file accordingly.
      contactMessages,
    },
  };

  const filename = `portfolio-backup-${backup.exportedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // `attachment` so the browser saves it rather than rendering a wall of
      // JSON, and names it with the date it was taken.
      "content-disposition": `attachment; filename="${filename}"`,
      // Never cached, anywhere. This is the whole database in one response.
      "cache-control": "no-store, private",
    },
  });
}
