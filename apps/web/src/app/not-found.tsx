/**
 * The 404 page.
 *
 * ## Deliberately not the full site chrome
 *
 * The header and footer are built from `getSiteContent()`, and a 404 is
 * exactly the situation where reading the database again is least wise: an
 * unknown URL is the most common thing a crawler or a scanner requests, and a
 * missing page should not cost a query per hit. This renders from nothing.
 *
 * ## It says what happened, not what went wrong with you
 *
 * Reached by a project that was unpublished as often as by a typo — see the
 * project route, which 404s drafts and archived work rather than confirming
 * the slug exists. So the copy does not accuse the visitor of mistyping
 * something; it offers the way back.
 */

import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  // Kept out of search results. A 404 already returns the right status code,
  // but a crawler that has one indexed will keep offering it to people.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center"
    >
      {/* Presentational, and marked so: a screen reader announcing "404"
          before the heading says the same thing twice. */}
      <p aria-hidden="true" className="font-mono text-6xl font-semibold text-accent">
        404
      </p>

      <h1 className="text-2xl font-semibold text-fg sm:text-3xl">
        This page isn’t here
      </h1>

      <p className="text-balance text-fg-muted">
        The link may be out of date, or the work it pointed to may no longer be
        published.
      </p>

      <Link
        href="/"
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to the portfolio
      </Link>
    </main>
  );
}
