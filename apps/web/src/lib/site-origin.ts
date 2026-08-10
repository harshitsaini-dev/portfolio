/**
 * The origin this request arrived on.
 *
 * ## Derived from the request, not configured
 *
 * Metadata that gets shared — Open Graph images, canonical links, the sitemap
 * — has to be **absolute**. A relative `/media/abc` in an `og:image` is not a
 * URL any social network can fetch, so something has to supply the scheme and
 * host.
 *
 * The obvious way is an environment variable, and the admin app does exactly
 * that with `SITE_ORIGIN` because it points at a *different* app. For the site
 * pointing at itself, reading the request is strictly better:
 *
 * - **It cannot be wrong.** A variable is a second copy of a fact the request
 *   already carries, and a second copy is a thing that can disagree. This
 *   project has already paid for that once: `NEXT_PUBLIC_SITE_ORIGIN` was
 *   inlined at build time while the value only existed at runtime, and the
 *   build silently substituted `undefined`.
 * - **It survives the custom domain.** When the site moves off `workers.dev`,
 *   canonical links and share cards follow it with no deploy and no variable
 *   to remember.
 *
 * ## Trusting the forwarded headers
 *
 * `x-forwarded-proto` and `host` are attacker-controllable on an origin
 * exposed directly to the internet, and trusting them blindly is how absolute
 * URLs get poisoned. Here they arrive from the Cloudflare edge, which sets
 * them; a request cannot reach this Worker without passing through it.
 *
 * The scheme is not read from a header at all — anything that is not
 * `localhost` is served over HTTPS, so it is decided rather than trusted. The
 * host is taken as given because it is the one thing the edge knows and this
 * code does not.
 */

import { headers } from "next/headers";

/** Where `next dev` runs, and the only origin that is not HTTPS. */
const DEV_ORIGIN = "http://localhost:3000";

export async function getSiteOrigin(): Promise<string> {
  const host = (await headers()).get("host");

  // No host header is not a state a real request reaches this code in. It is
  // reachable in tests and in tooling that renders a route out of band, and
  // returning the development origin there beats throwing inside metadata —
  // a page that renders with a wrong `og:image` is recoverable, a page that
  // does not render is not.
  if (!host) return DEV_ORIGIN;

  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${isLocal ? "http" : "https"}://${host}`;
}

/**
 * An absolute URL for a stored media asset.
 *
 * Components use the relative `/media/[id]` form and should keep doing so —
 * the browser resolves it, and a relative src is one less thing to get wrong.
 * This exists for the places a relative URL is not allowed: `og:image`,
 * `twitter:image`, and JSON-LD, all of which are read by machines that never
 * saw the page they came from.
 */
export function absoluteMediaUrl(origin: string, mediaId: string): string {
  return `${origin}/media/${encodeURIComponent(mediaId)}`;
}
