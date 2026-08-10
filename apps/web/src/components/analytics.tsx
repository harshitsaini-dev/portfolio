"use client";

/**
 * The page-view beacon.
 *
 * ## First-party, because the numbers belong to the owner
 *
 * A third-party beacon was written first and rejected: it would have put the
 * traffic on Cloudflare's dashboard, and the owner wants it on the CMS
 * dashboard beside the content it describes. So this posts to this site's own
 * `/api/track`, the counts live in this site's own database, and no third
 * party is contacted at all — which is also why `connect-src` stays `'self'`.
 *
 * ## What it sends
 *
 * The path and `document.referrer`. No cookie is set or read, no identifier is
 * generated, and nothing is kept in storage — two visits by the same person
 * are indistinguishable from two visits by different people, by construction.
 * The server reduces the referrer to a host before storing it, so a full
 * referring URL never lands in the database. See migration 0011.
 *
 * ## `sendBeacon`, with a fetch fallback
 *
 * `sendBeacon` hands the request to the browser to deliver in the background:
 * it survives the page being closed, and it cannot delay a navigation. The
 * `keepalive` fetch does the same job where it is unavailable. Neither is
 * awaited and neither can throw into the render.
 *
 * ## Why it counts route changes too
 *
 * `usePathname` re-runs the effect on client-side navigation, which a plain
 * load-time beacon would miss entirely — every project opened from the
 * carousel would go uncounted, and those are the numbers most worth having.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function Analytics() {
  const pathname = usePathname();
  // React runs effects twice in development's strict mode, and a counter that
  // double-counts every local page load is a counter that lies. Remembering
  // the last path sent also covers a re-render that does not change the route.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    lastSent.current = pathname;

    const body = JSON.stringify({
      path: pathname,
      referrer: document.referrer || undefined,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // A view that goes uncounted is not worth a console error on a page
        // that is otherwise working.
      });
    } catch {
      // Same reasoning: analytics never breaks the page it measures.
    }
  }, [pathname]);

  return null;
}
