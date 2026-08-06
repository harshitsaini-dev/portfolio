import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading timeline data. Phase 6
 * established that route metadata is evaluated independently of the
 * component, so `withAdminPage` cannot protect it — a metadata function that
 * read a record would leak it to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Experience · Portfolio Admin",
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // `listWithHighlights` attaches every entry's bullets in one extra query
  // rather than N. No visibility filter: the CMS list is the admin view and
  // shows hidden entries too.
  const entries = await repos.timeline.listWithHighlights();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Experience
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {entries.length === 0
              ? "No experience entries yet."
              : `${entries.length} entr${entries.length === 1 ? "y" : "ies"}, in display order.`}
          </p>
        </div>
        <Link
          href="/timeline/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New entry
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Roles you add appear here, newest first by display position.
            Hidden entries stay listed here but not on the public site.
          </p>
          <Link
            href="/timeline/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first entry
          </Link>
        </div>
      ) : (
        // `relative` is load-bearing alongside `overflow-x-auto`: the
        // `sr-only` labels in this table are absolutely positioned, and
        // without a positioned ancestor they resolve against the viewport
        // and drag the page's scroll width past it.
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All experience entries, ordered by display position
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Role</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Organization</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Period</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Highlights</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Updated</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {entry.role}
                    {entry.isVisible ? null : (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4 text-fg-muted">{entry.organization}</td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {entry.periodLabel ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {entry.highlights.length}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{entry.position}</td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {formatDate(entry.updatedAt)}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/timeline/${entry.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> {entry.role}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
