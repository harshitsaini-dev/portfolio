import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Every note, drafts included.
 *
 * Status is shown as a word, not a colour: "Draft" and "Published" are the
 * difference between a post the world can read and one it cannot, and that is
 * not a distinction to encode in a hue nobody has been told the meaning of.
 */
export const metadata: Metadata = {
  title: "Notes · Portfolio Admin",
};

/** `2026-08-10` → `10 Aug 2026`. Fixed locale so it reads the same anywhere. */
function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const notes = await repos.notes.list();

  const published = notes.filter((note) => note.status === "published").length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Content
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">Notes</h1>
          <p className="mt-2 text-sm text-fg-muted">
            {notes.length === 0
              ? "Nothing written yet."
              : `${notes.length} ${notes.length === 1 ? "note" : "notes"}, ${published} published.`}
          </p>
        </div>
        <Link
          href="/notes/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New note
        </Link>
      </div>

      {notes.length === 0 ? (
        <p className="mt-10 rounded-lg border border-subtle bg-surface p-6 text-sm text-fg-muted">
          A note is a short post — what you learned this week, why you chose a
          tool, how something broke. It shows the thinking behind the work,
          which the project pages cannot.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="flex flex-col gap-1 rounded-lg border border-subtle bg-surface p-4 transition-colors duration-150 hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-medium text-fg">{note.title}</span>
                  <span className="text-xs text-fg-muted">
                    {note.status === "published" ? "Published" : note.status === "draft" ? "Draft" : "Archived"}
                    {note.publishedAt ? ` · ${formatDate(note.publishedAt)}` : ""}
                  </span>
                </div>
                <span className="text-sm text-fg-muted">{note.summary}</span>
                <span className="font-mono text-xs text-fg-muted">/notes/{note.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
