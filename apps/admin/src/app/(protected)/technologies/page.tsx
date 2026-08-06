import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading technology data. Phase 6
 * established that route metadata is evaluated independently of the
 * component, so `withAdminPage` cannot protect it — a metadata function that
 * read a record would leak it to unauthenticated requests. A page title is
 * not worth that risk.
 */
export const metadata: Metadata = {
  title: "Technologies · Portfolio Admin",
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // Composed at the page layer from two repositories, each staying within
  // what it owns: technologies own their own rows, and the projects
  // aggregate owns `project_technologies`, so the usage count comes from
  // there. Two bounded queries, not N+1 — deletion is ON DELETE RESTRICT, so
  // showing usage up front is the difference between an informed action and
  // a guaranteed error.
  const [technologies, usage] = await Promise.all([
    repos.technologies.list(),
    repos.projects.countByTechnology(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Technologies
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {technologies.length === 0
              ? "No technologies yet."
              : `${technologies.length} technolog${technologies.length === 1 ? "y" : "ies"}, ordered by name.`}
          </p>
        </div>
        <Link
          href="/technologies/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New technology
        </Link>
      </div>

      {technologies.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Technologies you create appear here, and become available to tag on
            projects.
          </p>
          <Link
            href="/technologies/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Create the first technology
          </Link>
        </div>
      ) : (
        // `relative` is load-bearing alongside `overflow-x-auto`. The
        // `sr-only` labels in this table are absolutely positioned, and an
        // absolutely positioned element is laid out against its nearest
        // *positioned* ancestor — a non-positioned scroll container does not
        // contain it. Without `relative` they resolve against the viewport
        // from a cell that sits beyond it, widening the document's scroll
        // area even though the table itself scrolls correctly.
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All technologies, ordered by name
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Name</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Slug</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Category</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Used by</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Updated</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {technologies.map((technology) => {
                const count = usage[technology.id] ?? 0;
                return (
                  <tr key={technology.id} className="border-b border-subtle">
                    <th scope="row" className="py-3 pr-4 font-medium text-fg">
                      {technology.name}
                    </th>
                    <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                      {technology.slug}
                    </td>
                    <td className="py-3 pr-4 text-fg-muted">
                      {technology.category ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-fg-muted">
                      {count === 0
                        ? "Unused"
                        : `${count} project${count === 1 ? "" : "s"}`}
                    </td>
                    <td className="py-3 pr-4 text-fg-muted">
                      {formatDate(technology.updatedAt)}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/technologies/${technology.id}`}
                        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                      >
                        Edit
                        <span className="sr-only"> {technology.name}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
