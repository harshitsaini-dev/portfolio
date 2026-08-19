import "server-only";

import type { AdminIdentity } from "./identity.ts";
import { resolveSession, sessionCookieName } from "./session.ts";

/**
 * The current request's session, if it has one.
 *
 * A thin seam between the guard and the storage layer, and it exists for one
 * reason: `guard.ts` must stay loadable outside a Next.js request. Its
 * fail-closed branches are covered by tests that call it directly, and a
 * static import of `next/headers` or of the database binding would make the
 * whole module unloadable there — which is how those branches would quietly
 * stop being tested.
 *
 * ## Absence is not an error here
 *
 * Everything returns `null`. Whether a missing session should deny the request
 * is the guard's decision, not this file's, and during the move away from
 * Cloudflare Access a missing session is the *normal* case rather than a
 * failure. A thrown error would turn "not signed in yet" into a stack trace.
 */

/** Reads the session cookie, whichever of the two names is in play. */
async function readCookie(): Promise<string | null> {
  const { cookies, headers } = await import("next/headers");
  const jar = await cookies();
  const requestHeaders = await headers();

  /*
    Which cookie name to look for depends on the scheme.

    `__Host-` cookies cannot be set over plain HTTP, so `next dev` uses the
    unprefixed name — see `session.ts`. Reading is therefore ambiguous unless
    the scheme is known, and behind a proxy the only thing that knows it is
    `x-forwarded-proto`. Both names are tried, prefixed first: on a real
    deployment the unprefixed one cannot have been set by this app, and a
    subdomain that tried to plant one would find the prefixed name checked
    ahead of it.
  */
  const forwarded = requestHeaders.get("x-forwarded-proto");
  const secure = forwarded ? forwarded.split(",")[0]!.trim() === "https" : true;

  return (
    jar.get(sessionCookieName(true))?.value ??
    (secure ? null : jar.get(sessionCookieName(false))?.value) ??
    null
  );
}

/**
 * Resolves an active session into an identity, or null.
 *
 * Only `active` is accepted. A half-finished login — password given, code not
 * yet entered — carries a real cookie and a real row, and it must not
 * authorise anything; asking for the stage by name is what guarantees that a
 * future caller cannot accidentally accept one.
 */
export async function readSessionIdentity(): Promise<AdminIdentity | null> {
  let token: string | null = null;
  try {
    token = await readCookie();
  } catch {
    // Not inside a Next.js request — a test, or a module loaded at build time.
    // No cookies means no session, which is a true answer rather than a crash.
    return null;
  }
  if (!token) return null;

  const { getAdminRepositories } = await import("../db/binding.ts");
  const repositories = await getAdminRepositories();

  const lookup = await resolveSession(
    repositories.adminAuth,
    token,
    "active",
  );
  if (!lookup.ok) return null;

  // Recorded so the owner can tell a live session from an abandoned one. Not
  // awaited for correctness — the identity does not depend on it — but awaited
  // anyway, because a Worker may be torn down as soon as the response is
  // returned and an unawaited write is a write that might not happen.
  await repositories.adminAuth.touchSession(lookup.session.id);

  return {
    subject: lookup.user.id,
    email: lookup.user.email,
    source: "admin-session",
  };
}
