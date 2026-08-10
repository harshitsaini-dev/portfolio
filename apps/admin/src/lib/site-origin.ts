/**
 * Where the public site lives, as seen from the admin.
 *
 * ## Why this is a variable here, unlike on the public site
 *
 * The public site derives its own origin from the request, because the request
 * *is* the answer. The admin cannot: it is a different Worker on a different
 * host, and nothing in a request to the admin says where the site is. So it is
 * configuration — `SITE_ORIGIN`, set on the Worker.
 *
 * ## Why it is a function rather than three copies
 *
 * Three places need it: the layout, which points the tab icon at the site's
 * favicon; the middleware, whose `img-src` has to permit that icon; and the
 * backup route, which writes a download link for every media file.
 *
 * They each derived it separately once, and the layout and the middleware
 * disagreed about the development fallback — so local development blocked its
 * own favicon, with three CSP violations in the console. That is the whole
 * argument for this file: one fallback, one place to be wrong.
 *
 * ## Null in production when unset
 *
 * Not a guess. A URL built on a fabricated origin looks right and 404s, which
 * is worse than an absent one — each caller decides what to do with null, and
 * they choose differently: the CSP omits a host, the backup writes `null`, and
 * the layout omits the icon.
 */

/** Where `next dev` serves the public site. */
const DEV_SITE_ORIGIN = "http://localhost:3000";

export function getPublicSiteOrigin(): string | undefined {
  return (
    process.env.SITE_ORIGIN ??
    (process.env.NODE_ENV === "production" ? undefined : DEV_SITE_ORIGIN)
  );
}
