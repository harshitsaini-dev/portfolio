/**
 * The admin authorization guard.
 *
 * One place decides whether a request has an admin identity. Server
 * Components, Server Actions, and Route Handlers all call the same function
 * — duplicating this logic per route is how one route eventually forgets.
 *
 * Server-only by construction: it reads request headers, which is
 * impossible in a Client Component, and it is marked `server-only` so an
 * accidental client import is a build error rather than a runtime surprise.
 */

import "server-only";

import {
  developmentEmail,
  isDevelopmentAuthEnabled,
  readAccessConfig,
} from "./config.ts";
import type { AdminIdentity } from "./identity.ts";
import {
  ACCESS_JWT_HEADER,
  verifyAccessToken,
  type AccessFailureReason,
} from "./verify.ts";

/** Fixed subject for the local development identity. Never a real credential. */
export const DEVELOPMENT_SUBJECT = "development-admin";

/** Supplies the raw Access assertion for the current request. */
export type AccessTokenReader = () => Promise<string | null>;

/**
 * Reads the assertion from the incoming request headers.
 *
 * `next/headers` is imported dynamically rather than at module scope for two
 * reasons: it only resolves inside a Next.js request, and a static import
 * would make this module unloadable anywhere else — including in tests,
 * which then could not cover the fail-closed branches at all. Injecting the
 * reader is the same dependency-injection pattern the data layer uses.
 */
const requestTokenReader: AccessTokenReader = async () => {
  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  return requestHeaders.get(ACCESS_JWT_HEADER);
};

export type AdminAuthOutcome =
  | { readonly ok: true; readonly identity: AdminIdentity }
  | { readonly ok: false; readonly reason: AccessFailureReason; readonly detail: string };

/**
 * Resolve the current admin identity, or explain why there isn't one.
 *
 * Order matters. Access verification is attempted **first**, so that when
 * real Access configuration exists it is authoritative and the development
 * path is unreachable. The development branch is only consulted when
 * `isDevelopmentAuthEnabled` returns true, which requires a non-production
 * build, an explicit opt-in, *and* the absence of Access configuration.
 */
export async function resolveAdminIdentity(
  env: NodeJS.ProcessEnv = process.env,
  readToken: AccessTokenReader = requestTokenReader,
): Promise<AdminAuthOutcome> {
  const accessConfigured = readAccessConfig(env).ok;

  if (accessConfigured) {
    const token = await readToken();
    const result = await verifyAccessToken(token, { env });
    if (result.ok) {
      return { ok: true, identity: result.identity };
    }
    // No fallback. A configured deployment that fails verification is
    // denied — it does not quietly downgrade to a development identity.
    return { ok: false, reason: result.reason, detail: result.detail };
  }

  if (isDevelopmentAuthEnabled(env)) {
    return {
      ok: true,
      identity: {
        subject: DEVELOPMENT_SUBJECT,
        email: developmentEmail(env),
        source: "development",
      },
    };
  }

  // Neither configured Access nor permitted development auth: fail closed.
  return {
    ok: false,
    reason: "not_configured",
    detail: "Cloudflare Access is not configured and development auth is not enabled",
  };
}

/**
 * The identity if there is one, otherwise `null`.
 *
 * For callers that render differently when signed out rather than blocking.
 */
export async function getAdminIdentity(
  env: NodeJS.ProcessEnv = process.env,
  readToken: AccessTokenReader = requestTokenReader,
): Promise<AdminIdentity | null> {
  const outcome = await resolveAdminIdentity(env, readToken);
  return outcome.ok ? outcome.identity : null;
}

/**
 * Thrown when a protected boundary has no valid admin identity.
 *
 * Carries a coarse reason for server-side logging. The rendered page shows
 * a generic message — a precise reason would tell an attacker which part of
 * their forgery to fix.
 */
export class AdminUnauthorizedError extends Error {
  readonly reason: AccessFailureReason;

  constructor(reason: AccessFailureReason, detail: string) {
    super(`admin access denied: ${reason}`);
    this.name = "AdminUnauthorizedError";
    this.reason = reason;
    // `detail` is deliberately not put on `message`: messages can surface in
    // error overlays. Kept as a non-enumerable property for logs only.
    Object.defineProperty(this, "detail", {
      value: detail,
      enumerable: false,
    });
  }
}

/**
 * Require a valid admin identity, or throw.
 *
 * The protected layout calls this, so every page beneath it is covered by
 * default — a new page is protected because of where it lives, not because
 * someone remembered to add a check.
 */
export async function requireAdminIdentity(
  env: NodeJS.ProcessEnv = process.env,
  readToken: AccessTokenReader = requestTokenReader,
): Promise<AdminIdentity> {
  const outcome = await resolveAdminIdentity(env, readToken);
  if (!outcome.ok) {
    throw new AdminUnauthorizedError(outcome.reason, outcome.detail);
  }
  return outcome.identity;
}

/** Where unauthenticated requests are sent. */
export const DENIED_PATH = "/denied";

/**
 * Require an admin identity in a page or layout, redirecting if absent.
 *
 * **Every protected page must call this at the top of its component**, not
 * only rely on the layout. That is not belt-and-braces pedantry — it fixes a
 * real information disclosure:
 *
 *   React renders a layout and its `children` concurrently. When only the
 *   layout redirects, the page component has *already run*, and its output
 *   is serialized into the RSC flight payload that ships with the redirect
 *   response. Verified against a production build: an unauthenticated
 *   `GET /` returned 307 with an 11.9 KB body containing the dashboard's
 *   full component tree.
 *
 * Awaiting this before producing any JSX means the redirect is thrown while
 * the component is still executing, so there is no content to serialize.
 * The layout keeps its own call as the boundary that catches a page which
 * forgets.
 */
export async function requireAdminIdentityOrRedirect(
  env: NodeJS.ProcessEnv = process.env,
  readToken: AccessTokenReader = requestTokenReader,
): Promise<AdminIdentity> {
  const outcome = await resolveAdminIdentity(env, readToken);
  if (!outcome.ok) {
    console.warn(`[admin] access denied (${outcome.reason}): ${outcome.detail}`);
    // Imported dynamically for the same reason as `next/headers`: it keeps
    // this module loadable outside a Next request, so the fail-closed
    // branches stay testable.
    const { redirect } = await import("next/navigation");
    redirect(DENIED_PATH);
    // Unreachable: `redirect()` throws. TypeScript cannot see its `never`
    // return through a dynamic import, so the intent is stated explicitly
    // rather than papered over with a cast — and if `redirect` ever stopped
    // throwing, this would still fail closed instead of returning undefined.
    throw new AdminUnauthorizedError(outcome.reason, outcome.detail);
  }
  return outcome.identity;
}
