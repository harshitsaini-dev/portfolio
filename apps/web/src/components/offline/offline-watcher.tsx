"use client";

/**
 * Covers the page when an open tab loses its connection.
 *
 * The service worker handles the cold case — a navigation that cannot reach
 * the origin. This handles the far more common one: someone is already reading
 * the site when the train enters a tunnel. Nothing has failed yet, so there is
 * no navigation for the service worker to intercept, and without this the page
 * simply becomes quietly broken — links that never resolve, a form that posts
 * into nothing.
 *
 * ## It waits for a failure it can see
 *
 * Mounting on `navigator.onLine === false` alone would be wrong: that property
 * reports the state of a network interface, so a machine on a router with a
 * dead uplink reads as online, and a VM with an odd adapter can read as offline
 * while the internet works perfectly. This mounts on the `offline` *event* —
 * an actual transition the browser observed — and the screen it shows confirms
 * with a real request before it dismisses itself.
 *
 * ## Dismissing does not reload
 *
 * The page underneath never went anywhere. Reloading would throw away the
 * scroll position, whatever was typed into the contact form, and the terminal's
 * history — to fetch a page that is already rendered.
 *
 * ## It renders nothing until it is needed
 *
 * No wrapper, no portal, no layout effect on every page load: an event
 * listener and a `null`. The offline screen and the snake game are pulled in
 * only when the connection actually drops, so the code for them is not in the
 * bundle every visitor downloads.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

// Loaded on demand. `ssr: false` because it exists to react to a browser event
// that the server cannot have observed.
const OfflineScreen = dynamic(
  () => import("@/components/offline/offline-screen").then((m) => m.OfflineScreen),
  { ssr: false },
);

export function OfflineWatcher() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  // Locks the page behind the overlay. Without this the body keeps scrolling
  // under a fixed layer, which reads as the screen sliding around.
  useEffect(() => {
    if (!isOffline) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOffline]);

  const onReconnect = useCallback(() => setIsOffline(false), []);

  if (!isOffline) return null;

  return (
    <div
      // A dialog, because it covers the page and takes it over. `aria-modal`
      // tells assistive technology not to wander into the document behind it,
      // which is exactly right: that content is stale and its links are dead
      // until the network returns.
      role="dialog"
      aria-modal="true"
      aria-label="You are offline"
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
    >
      {/* `hasFailed`: this only mounts because the browser told us the
          connection went, so the screen may act on the first success. */}
      <OfflineScreen onReconnect={onReconnect} hasFailed />
    </div>
  );
}
