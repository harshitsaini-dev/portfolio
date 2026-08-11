/**
 * Published notes, for the public site.
 *
 * The status filter lives here, next to the read, rather than in each route —
 * the same rule the project pages follow, and for the same reason: a caller
 * that forgot it would publish a draft.
 */

import type { Note } from "@portfolio/types";

import { cachedRead } from "@/lib/content/cache";
import { getSiteRepositories } from "@/lib/db/binding";

export interface NoteSummary {
  /** This note's own accent, or null to follow the site's. */
  readonly accent: string | null;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  /** ISO date the post claims, falling back to when it was written. */
  readonly date: string;
  readonly coverMediaId: string | null;
}

function toSummary(note: Note): NoteSummary {
  return {
    slug: note.slug,
    title: note.title,
    summary: note.summary,
    tags: note.tags,
    // A published note is never undated: `published_at` is optional, and the
    // row's own creation time is the honest fallback.
    date: (note.publishedAt ?? note.createdAt).slice(0, 10),
    coverMediaId: note.coverMediaId,
    accent: note.accent,
  };
}

/**
 * Degrades to an empty list rather than throwing.
 *
 * The table arrives with migration 0012, and a schema change cannot land in
 * the same instant as the deploy that reads it. The gap is a state this has to
 * survive — it did not, once: deploying the terminal-lines feature ahead of its
 * migration returned 500 to every visitor. An empty list renders as "nothing
 * published here yet", which is also true before the first note is written.
 *
 * Logged, not swallowed. The sitemap and the index both call this, and a
 * sitemap that 500s is one `robots.txt` points a crawler at.
 */
export async function getPublishedNotes(): Promise<readonly NoteSummary[]> {
  return cachedRead("notes", async () => {
    try {
      const repos = await getSiteRepositories();
      const notes = await repos.notes.list({ statuses: ["published"] });
      return notes.map(toSummary);
    } catch (error) {
      console.error("notes unavailable, rendering an empty list", error);
      return [];
    }
  });
}

export interface NoteDetail extends NoteSummary {
  readonly body: string;
  readonly updatedAt: string;
}

/** `null` for a slug that is missing, draft or archived. */
export async function getNoteDetail(slug: string): Promise<NoteDetail | null> {
  return cachedRead(`note:${slug}`, async () => {
    try {
      const repos = await getSiteRepositories();
      const note = await repos.notes.getBySlug(slug);
      // The check is here rather than in the route: a page that serves a draft
      // publishes it, and this is the one place that can prevent it.
      if (!note || note.status !== "published") return null;
      return { ...toSummary(note), body: note.body, updatedAt: note.updatedAt };
    } catch (error) {
      // Same reasoning as the list, with a different shape: null becomes a 404,
      // which is the honest answer for a note the site cannot read.
      console.error("note unavailable", error);
      return null;
    }
  });
}
