/**
 * The page-view beacon's endpoint.
 *
 * First-party by design. The owner asked for the numbers to appear on the CMS
 * dashboard rather than on Cloudflare's, which means this site both collects
 * and serves them — see migration 0011 for what is stored, and what
 * deliberately is not.
 *
 * ## Why a beacon rather than counting renders
 *
 * Counting in the page's own render would be simpler and would be wrong: every
 * crawler, uptime check and link-preview fetch renders the page, and none of
 * them are visits. Requiring a script to run filters nearly all of that out,
 * because almost nothing automated executes JavaScript.
 *
 * ## Input is not trusted, because it comes from the client
 *
 * `path` decides a primary key, so a caller could otherwise write unbounded
 * junk into the table. It is validated as a site-relative path, length-capped,
 * and stripped of its query string — `?utm_source=…` would split one page into
 * a dozen rows meaning the same thing.
 *
 * The referrer is reduced to a **host** here rather than in the browser, so a
 * client cannot post a full URL and have it stored.
 *
 * ## It cannot fail loudly
 *
 * Every path returns 204. A counter is not worth an error in someone's
 * console, and a failure here says nothing the visitor can act on — including
 * when the table does not exist yet, which is the state between a deploy and
 * its migration. That case is logged, once, with the error.
 */

import { NextResponse } from "next/server";

import { pageViewBeaconSchema } from "@portfolio/schemas";

import { getSiteRepositories } from "@/lib/db/binding";

export const dynamic = "force-dynamic";

/** The referring site, or null for a direct visit or anything unparseable. */
function toReferrerHost(referrer: string | undefined, selfHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const { hostname } = new URL(referrer);
    // Internal navigation is not a referral. Without this the top referrer is
    // always the site itself, which answers a question nobody asked.
    if (selfHost && hostname === selfHost.split(":")[0]) return null;
    return hostname.slice(0, 255);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = pageViewBeaconSchema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    const path = parsed.data.path.split("?")[0]?.split("#")[0] ?? "/";
    const referrerHost = toReferrerHost(
      parsed.data.referrer,
      request.headers.get("host"),
    );

    const repos = await getSiteRepositories();
    await repos.analytics.recordView({ path, referrerHost });
  } catch (error) {
    // Includes the window between deploying this and applying migration 0011.
    // Deliberately swallowed after logging: see the header.
    console.error("page view not recorded", error);
  }

  // 204 in every case, including the failures above. `sendBeacon` ignores the
  // response entirely, so the status is for anyone reading the network tab.
  return new NextResponse(null, { status: 204 });
}
