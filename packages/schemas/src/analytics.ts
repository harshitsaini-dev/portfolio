/**
 * Validation for the page-view beacon's body.
 *
 * The only schema in this package validating input from an **anonymous
 * public** caller rather than from the authenticated admin. That raises the
 * stakes on every field: nobody has signed in, nothing is rate-limited by a
 * session, and `path` becomes half of a primary key. Anything not bounded here
 * is unbounded in the database.
 */

import { z } from "zod";

export const pageViewBeaconSchema = z
  .object({
    /**
     * The site-relative path being counted.
     *
     * The regex is the load-bearing part. A leading slash not followed by a
     * second one rejects both `https://elsewhere.example` and the
     * protocol-relative `//elsewhere.example` — either of which would
     * otherwise be stored as a "page" of this site, and shown as one on the
     * dashboard.
     *
     * The length cap bounds the row: without it a caller could write 100KB
     * keys until the table is the largest thing in the database.
     */
    path: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^\/(?!\/)/, "must be a site-relative path"),
    /**
     * The browser's `document.referrer`, in full.
     *
     * Accepted as a whole URL and reduced to a host **on the server**, never
     * by the client. A client that could post the stored value directly could
     * post anything; parsing it server-side means what lands in the table is
     * always something a URL parser produced.
     */
    referrer: z.string().trim().max(2048).optional(),
  })
  .strict();

export type PageViewBeacon = z.infer<typeof pageViewBeaconSchema>;
