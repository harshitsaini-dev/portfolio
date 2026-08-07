/**
 * The project's single URL policy.
 *
 * ## Why this is shared rather than redeclared per entity
 *
 * The other leaf primitives in this package (`requiredText`, `nullableText`,
 * `nullableDate`, `positionValue`) are deliberately redeclared per module:
 * they are editorial bounds, and a module choosing a different maximum
 * length is a normal domain decision rather than a defect.
 *
 * A protocol allowlist is not that. It is a **security control** — the thing
 * standing between stored input and `javascript:alert(1)` rendered into an
 * `href`. Two copies of a security control are two things that can drift,
 * and the copy that drifts is the vulnerability. So the predicate lives
 * here once, and every entity that stores a URL refines against it.
 *
 * Projects established the rule in Phase 7; this module is that same rule
 * moved, not a new one. Certifications' `credential_url` is its second
 * consumer.
 *
 * Internal to the package: not re-exported from `index.ts`, because callers
 * should use the entity schemas rather than assemble their own.
 */

import { z } from "zod";

/**
 * `URL` is a Web API global — present in Workers, Node 18+, and browsers.
 * Declared minimally rather than pulling in the DOM lib, which would drag
 * hundreds of browser globals into a validation package.
 */
declare const URL: {
  new (input: string): { readonly protocol: string };
};

/** Editorial ceiling, applied wherever a URL is stored. */
export const URL_MAX_LENGTH = 2048;

/** One message, so the two consumers cannot describe the rule differently. */
export const HTTP_URL_MESSAGE = "Enter a valid http(s) URL";

/**
 * http(s) only.
 *
 * `z.url()` alone would accept `javascript:alert(1)` and `data:` URLs, which
 * become stored XSS the moment a link is rendered with `href`. The protocol
 * allowlist is the control that matters; the admin and public UIs
 * additionally render external links with `rel="noopener noreferrer"`.
 *
 * Anything `URL` cannot parse at all is rejected too — a bare `example.com`
 * has no protocol and would resolve relative to whatever page rendered it.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** A required http(s) URL. Used by project links. */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(URL_MAX_LENGTH, "Too long")
  .refine(isHttpUrl, { message: HTTP_URL_MESSAGE });

/**
 * An optional http(s) URL stored in a nullable column: blank becomes `null`,
 * anything present must still satisfy the same allowlist.
 *
 * Declared without a default or `.optional()` — the create and update shapes
 * add those themselves, for the reason each entity module documents.
 */
export const nullableHttpUrlSchema = z
  .string()
  .trim()
  .max(URL_MAX_LENGTH, "Too long")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .refine((value) => value === null || isHttpUrl(value), {
    message: HTTP_URL_MESSAGE,
  });
