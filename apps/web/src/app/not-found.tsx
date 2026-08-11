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
 * ## The screen is shared, the words are not
 *
 * `SystemScreen` is the same shell the offline page and the error page use, so
 * the three dead ends are one design rather than three that resemble each
 * other. What belongs to being a 404 — the resolver log, the links out, the
 * maze — lives in `NotFoundScreen`.
 *
 * This file stays a Server Component so it can keep exporting `metadata`,
 * which a `"use client"` module cannot.
 */

import type { Metadata } from "next";

import { NotFoundScreen } from "@/components/system/not-found-screen";

export const metadata: Metadata = {
  title: "Page not found",
  // Kept out of search results. A 404 already returns the right status code,
  // but a crawler that has one indexed will keep offering it to people.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
