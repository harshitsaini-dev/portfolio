/**
 * The site, as a terminal.
 *
 * ## Why a route and not a modal over the home page
 *
 * The obvious build is a full-screen overlay toggled by a button. It is worse
 * in every way that matters here: an overlay has to trap focus, disable the
 * page behind it, restore focus on close, and stay honest about all three —
 * and when it is done, the thing a visitor is looking at still has no address.
 *
 * A route gets the same result from the browser for free. Nothing is behind it
 * to trap focus away from, Back does what Back always does, and the mode can be
 * linked, bookmarked and shared. The toggle is a link each way, which is also
 * the one control that works with JavaScript still loading.
 *
 * ## It is an alternate view, never the only one
 *
 * Every command answers with content that is on the normal site, and each
 * answer that points somewhere renders a real link into it. Someone who lands
 * here and does not want a terminal is one click from the ordinary page — the
 * way out is the first thing in the tab order, not buried under the prompt.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { CommandTerminal } from "@/components/ui/command-terminal";
import { getSiteContent } from "@/lib/content/site-content";
import { buildTerminalData } from "@/lib/content/terminal-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return {
    title: `Terminal · ${content.siteName}`,
    description: `A command-line view of ${content.profile.name}'s portfolio.`,
    alternates: { canonical: "/terminal" },
    // The normal page says everything this one says, in a form a search engine
    // can read. Two indexed URLs for one set of facts competes with itself.
    robots: { index: false, follow: true },
  };
}

export default async function TerminalPage() {
  const content = await getSiteContent();

  return (
    <main
      id="main-content"
      className="mx-auto flex h-dvh max-w-5xl flex-col gap-4 px-5 py-6 sm:px-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-mono text-sm text-fg-muted">
          {content.profile.name} — terminal
        </h1>
        {/* First in the tab order after the heading, deliberately. */}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md text-sm text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Leave terminal mode
        </Link>
      </div>

      {/* `min-h-0` so the log scrolls inside the terminal rather than growing
          the flex column past the viewport and scrolling the page instead. */}
      <div className="min-h-0 flex-1">
        <CommandTerminal
          data={buildTerminalData(content)}
          fullPage
          footer={
            <p className="text-fg-muted">
              Type <code className="text-accent">help</code> for the commands.
              Everything here is also on the{" "}
              <Link
                href="/"
                className="underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                normal site
              </Link>
              .
            </p>
          }
        />
      </div>
    </main>
  );
}
