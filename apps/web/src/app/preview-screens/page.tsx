import type { Metadata } from "next";

import { AdminScreenLinks } from "@/components/system/admin-screen-links";

/**
 * A way to look at every system screen without breaking anything.
 *
 * ## There are four
 *
 * Offline, not found, something broke, access denied. Not six: the admin does
 * not have its own not-found and its own error screen, it shows *these* — same
 * figure, same log, same game, with the way out pointing at the dashboard
 * instead of the portfolio. Two apps with two ideas of what a dead end looks
 * like is how a product stops feeling like one thing.
 *
 * ## Why it exists, and why it ships
 *
 * The 404 is one wrong URL away and the offline screen has its own route, but
 * the error boundary only appears when something actually throws — so checking
 * a change to it meant temporarily breaking a page, which is a bad habit to
 * build and an easy thing to forget to undo.
 *
 * It ships to production because that is where these are worth checking: the
 * real accent from the CMS, the real service worker, the real fonts, the real
 * device. A workbench that only exists on localhost checks the wrong copy.
 *
 * It is `noindex` and nothing links to it, so it is found the way `/whoami`
 * is: by being told. Nothing here is private — every screen it links to is one
 * a visitor can reach on their own.
 *
 * One honest cost: `/preview-screens/boom` throws on purpose, so in production
 * each visit writes a real entry to the Worker's error log.
 */

export const metadata: Metadata = {
  title: "System screens",
  // Never a search result. It is a list of the site's failure states, which is
  // not something anybody should arrive at from Google.
  robots: { index: false, follow: false },
};

export default function PreviewScreens() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          System screens
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          The four dead ends, in one place. Not linked from anywhere and kept
          out of search. Each takes its colour from Settings → System screens.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-subtle border-y border-subtle">
        <Row href="/offline" title="Offline" game="Signal — reconnect the line">
          Also appears over any page when the connection drops. To see that:
          DevTools → Network → Offline, then reload.
        </Row>
        <Row href="/does-not-exist" title="Not found (404)" game="Maze">
          Any address that does not resolve. The admin shows this same screen.
        </Row>
        <Row href="/preview-screens/boom" title="Something broke (500)" game="Whack-a-bug">
          Throws on purpose. Each visit writes one real error to the Worker log.
          The admin shows this same screen.
        </Row>

        {/* The one screen that lives on the other host. */}
        <AdminScreenLinks />
      </ul>
    </main>
  );
}

function Row({
  href,
  title,
  game,
  children,
}: {
  href: string;
  title: string;
  game: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        className="flex flex-col gap-1 py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-base font-medium text-accent">{title}</span>
          <span className="font-mono text-xs text-fg-muted">{game}</span>
        </span>
        <span className="text-sm text-fg-muted">{children}</span>
      </a>
    </li>
  );
}
