"use client";

/**
 * The `/offline` route's client half.
 *
 * Split from the page so the page itself stays a Server Component and can
 * carry `metadata` — a `"use client"` module cannot export one.
 *
 * ## Why it reloads rather than routing
 *
 * The visitor asked for a page that was never fetched: a client-side
 * navigation would ask the router for a route tree that is not in memory, over
 * a connection that has only just come back. `location.reload()` re-runs the
 * original request, and the service worker — now able to reach the network —
 * answers it with the real page.
 *
 * `history.length > 1` decides where: someone who reached this from a link
 * inside the site is sent back to what they were reading, and someone who
 * opened a cold tab offline gets the home page, because there is nothing to go
 * back to.
 */

import { useCallback } from "react";

import { OfflineScreen } from "@/components/offline/offline-screen";

export function OfflineRoute() {
  const onReconnect = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      // If `back()` lands on another cached offline page — which happens when
      // several navigations failed in a row — the reload is the way out.
      setTimeout(() => window.location.reload(), 400);
      return;
    }
    window.location.replace("/");
  }, []);

  return <OfflineScreen onReconnect={onReconnect} />;
}
