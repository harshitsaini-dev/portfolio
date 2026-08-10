/**
 * Published notes, for the public site.
 *
 * The status filter lives here, next to the read, rather than in each route \u2014
 * the same rule the project pages follow, and for the same reason: a caller
 * that forgot it would publish a draft.
 */

import type { Note } from "@portfolio/types";

import { cachedRead } from "@/lib/content/cache";
import { getSiteRepositories } from "@/lib/db/binding";

export interface NoteSummary {
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
  };
}

export async function getPublishedNotes(): Promise<readonly NoteSummary[]> {
  return cachedRead("notes", async () => {
    const repos = await getSiteRepositories();
    const notes = await repos.notes.list({ statuses: ["published"] });
    return notes.map(toSummary);
  });
}

export interface NoteDetail extends NoteSummary {
  readonly body: string;
  readonly updatedAt: string;
}

/** `null` for a slug that is missing, draft or archived. */
export async function getNoteDetail(slug: string): Promise<NoteDetail | null> {
  return cachedRead(`note:${slug}`, async () => {
    const repos = await getSiteRepositories();
    const note = await repos.notes.getBySlug(slug);
    // The check is here rather than in the route: a page that serves a draft
    // publishes it, and this is the one place that can prevent it.
    if (!note || note.status !== "published") return null;
    return { ...toSummary(note), body: note.body, updatedAt: note.updatedAt };
  });
}
