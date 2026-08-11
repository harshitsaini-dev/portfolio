import type { Metadata } from "next";

import { DeniedScreen } from "@/components/denied/denied-screen";
import { getScreenAccent } from "@/lib/site-accent";

export const metadata: Metadata = {
  title: "Access denied · Portfolio Admin",
};

/**
 * The unauthenticated landing page.
 *
 * Lives **outside** the `(protected)` route group on purpose: the protected
 * layout redirects here, and this page must render without an identity.
 *
 * The message is deliberately generic. It says access was denied, not *why* —
 * "expired token", "wrong audience", or "development auth is not enabled"
 * would each tell an attacker precisely which part of their attempt to change.
 * The real reason is in the server logs.
 *
 * ## The one read it does
 *
 * Its accent, so the screen can carry the colour the owner chose for it in the
 * CMS. That read is unauthenticated by necessity — this page is reached
 * *because* there is no identity — so it asks for exactly one nullable colour
 * and nothing else, and falls back to the site accent if the query fails. No
 * content, no settings, nothing that would matter if it leaked, which it
 * cannot: a hex is already visible in every pixel of the page.
 */
export default async function DeniedPage() {
  const accent = await getScreenAccent("denied");
  return <DeniedScreen accent={accent} />;
}
