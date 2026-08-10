/**
 * `robots.txt`.
 *
 * Dynamic for one reason: the sitemap's URL has to be absolute, and the
 * absolute origin is derived from the request rather than configured — see
 * `lib/site-origin.ts`. A statically generated file would have to name a host
 * at build time, which is the assumption that breaks the day the site moves to
 * a custom domain.
 *
 * ## What is disallowed, and what deliberately is not
 *
 * `/media/[id]` stays crawlable. Those are the site's images, they are already
 * public, and blocking them would keep the portfolio's own work out of image
 * search for no benefit — the route serves published assets only.
 *
 * The admin is a **separate Worker on a different host**, so it is not
 * reachable from this origin and there is nothing here to exclude. It is also
 * behind Cloudflare Access, which is what actually protects it. A `Disallow`
 * line is a request, not a control: it stops well-behaved crawlers and tells
 * everyone else exactly where to look.
 */

import type { MetadataRoute } from "next";

import { getSiteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getSiteOrigin();

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${origin}/sitemap.xml`,
  };
}
