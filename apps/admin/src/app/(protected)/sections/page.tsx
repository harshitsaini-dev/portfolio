import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading section data. Phase 6
 * established that route metadata is evaluated independently of the
 * component, so `withAdminPage` cannot protect it — a metadata function that
 * read a record would leak it to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Sections · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // No visibility filter: the CMS list is the admin view and shows hidden
  // sections too, badged rather than omitted. Ordering comes from the
  // repository (position, then created_at) — never re-sorted here.
  const sections = await repos.sections.list();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Sections
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {sections.length === 0
              ? "No sections yet."
              : `${sections.length} section${sections.length === 1 ? "" : "s"}, in display order.`}
          </p>
        </div>
        <Link
          href="/sections/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New section
        </Link>
      </div>

      {sections.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
            Sections control the ordering, headings, and visibility of the
            public page. Each one carries a stable key that the site maps to a
            component. Hidden sections stay listed here but not on the site.
          </p>
          <Link
            href="/sections/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first section
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
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All page sections, ordered by display position
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Title</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Key</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Eyebrow</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Subtitle</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {section.title}
                    {section.isVisible ? null : (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                    {section.key}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {section.eyebrow ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {section.subtitle ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{section.position}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/sections/${section.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> {section.title}</span>
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
