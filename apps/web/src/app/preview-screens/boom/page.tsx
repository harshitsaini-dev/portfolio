/**
 * Throws, so the error boundary can be looked at.
 *
 * ## It ships to production, deliberately
 *
 * The error screen is the one page whose appearance cannot be checked without
 * something failing, and checking it on the deployed site is the only check
 * that counts — the real accent, the real fonts, the real device. The
 * alternative was breaking a real page to look at it, which is how a temporary
 * change becomes a permanent one.
 *
 * The cost is honest and small: each visit writes one genuine error to the
 * Worker's log. Nothing else happens — Next catches it at the boundary, the
 * response is a 500, and no other route is affected.
 *
 * `force-dynamic` because a page whose whole job is to fail must not be
 * prerendered: a build-time throw would break the build rather than the page.
 */

export const dynamic = "force-dynamic";

export default function Boom() {
  throw new Error("Deliberate failure, so the error screen can be reviewed.");
}
