/**
 * `/offline` — what the service worker serves when a navigation fails.
 *
 * ## It reads nothing
 *
 * Like the 404, and for a stronger reason: this page is **precached**. Anything
 * it rendered from the CMS would be frozen at the moment the visitor's browser
 * installed the service worker and would then be wrong for as long as the cache
 * lived. A page about the network being down is chrome, not content, so there
 * is nothing here that an editor should be able to change and nothing that can
 * go stale.
 *
 * ## Static, deliberately
 *
 * No `force-dynamic`, unlike every other route in this app. There is no request
 * to vary on, and the whole point is that the HTML can be stored and served
 * with no server involved — a dynamic route would be a page the service worker
 * could cache but the origin could never have produced in the first place.
 */

import type { Metadata } from "next";

import { OfflineRoute } from "@/components/offline/offline-route";

export const metadata: Metadata = {
  title: "Offline",
  // Never a search result: it describes the visitor's network, not this site,
  // and a crawler that indexed it would offer it to people who are online.
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <OfflineRoute />;
}
