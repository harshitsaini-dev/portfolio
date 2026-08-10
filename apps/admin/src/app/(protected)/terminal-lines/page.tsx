import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading the rows. Phase 6 established
 * that route metadata is evaluated independently of the component, so
 * `withAdminPage` cannot protect it — a metadata function that read a record
 * would leak it to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Terminal lines · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // No visibility filter: the CMS list is the admin view and shows hidden
  // lines too, badged rather than omitted. Ordering comes from the repository
  // (position, then created_at) — never re-sorted here.
  const lines = await repos.terminalLines.list();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Terminal lines
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {lines.length === 0
              ? "No lines yet."
              : `${lines.length} line${lines.length === 1 ? "" : "s"}. One is picked at random every few seconds.`}
          </p>
          {/*
            Two things an editor cannot work out from the list alone, and both
            change what they should write here.
          */}
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            The greeting (“good morning”, “good evening”) is not in this list —
            it is chosen from the clock in India and cannot be stored. These
            lines are shown alongside it. The bubble itself can be switched off
            entirely under{" "}
            <Link
              href="/settings"
              className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
            >
              Settings
            </Link>
            .
          </p>
        </div>
        <Link
          href="/terminal-lines/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New line
        </Link>
      </div>

      {lines.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            With no lines the robot only greets the visitor by time of day. Add
            some and it will alternate between them.
          </p>
          <Link
            href="/terminal-lines/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Add the first line
          </Link>
        </div>
      ) : (
        // `relative` is load-bearing alongside `overflow-x-auto`: the
        // `sr-only` labels here are absolutely positioned, and an absolutely
        // positioned element resolves against its nearest *positioned*
        // ancestor. Without it they escape the scroll container and widen the
        // document.
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All terminal lines, ordered by display position
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Line</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {line.text}
                    {line.isVisible ? null : (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </th>
                  <td className="py-3 pr-4 text-fg-muted">{line.position}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/terminal-lines/${line.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> “{line.text}”</span>
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
