import "server-only";

import type { AdminAuthRepository } from "@portfolio/database";
import type { AdminSession, AdminSessionStage, AdminUser } from "@portfolio/types";

import { createSessionToken, hashToken } from "./crypto.ts";

/**
 * Sessions: the cookie, the row, and the rules for trusting them.
 *
 * ## The cookie holds a token; the database holds its hash
 *
 * So a copy of the database is not a set of usable sessions. The only place
 * the token itself exists is the owner's browser, which is the definition of
 * a bearer credential done properly.
 *
 * ## One cookie, three stages
 *
 * A half-finished login needs somewhere to live so the second step survives a
 * page reload. Rather than a second cookie with its own lifetime and its own
 * chance of being trusted by mistake, the same cookie carries a session whose
 * `stage` says how far it has got. `requireActiveSession` accepts exactly one
 * value; everything else has to ask for what it wants by name.
 */

/**
 * The cookie name.
 *
 * `__Host-` is not decoration. The prefix is enforced by the browser: it
 * refuses to store the cookie unless it is Secure, has no Domain attribute
 * and is pathed at `/`. That makes it impossible for a subdomain — including
 * one an attacker manages to stand up — to write a cookie this app would
 * read. It also means the cookie cannot be set over plain HTTP, which is why
 * the development fallback below exists.
 */
export const SESSION_COOKIE = "__Host-admin_session";

/**
 * The name used when the connection is not HTTPS.
 *
 * `next dev` serves plain HTTP on localhost, where a `__Host-` cookie is
 * silently dropped — silently being the problem: the login would appear to
 * work and then forget itself on the next request. Production always gets the
 * prefixed name; there is no configuration that lets the weaker one through.
 */
export const DEV_SESSION_COOKIE = "admin_session";

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE : DEV_SESSION_COOKIE;
}

/** How long a half-finished login has to enter its emailed code. */
export const PENDING_TTL_MS = 10 * 60_000;

/** How long a reset ticket lasts between the code and the new password. */
export const RESET_TTL_MS = 10 * 60_000;

/**
 * How long a signed-in session lasts.
 *
 * Twelve hours. Long enough that a day's editing does not involve logging in
 * twice; short enough that a laptop left open in a café stops being a way in
 * by the evening. Not extended on activity — a fixed lifetime is easier to
 * reason about than a sliding one, and this is a single-user CMS, not a
 * consumer product that must never inconvenience anybody.
 */
export const ACTIVE_TTL_MS = 12 * 60 * 60_000;

export interface IssuedSession {
  /** Goes in the cookie. Never stored, never logged. */
  readonly token: string;
  readonly session: AdminSession;
}

/**
 * Mints a session and returns the token exactly once.
 *
 * The caller writes it to a cookie and then forgets it; there is no way to
 * read it back afterwards, which is the point.
 */
export async function issueSession(
  repository: AdminAuthRepository,
  user: AdminUser,
  stage: AdminSessionStage,
  ttlMs: number,
  request: { userAgent?: string | null; ip?: string | null } = {},
): Promise<IssuedSession> {
  const token = createSessionToken();
  const id = await hashToken(token);
  const session = await repository.createSession({
    id,
    userId: user.id,
    stage,
    passwordVersion: user.passwordVersion,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    // Truncated: a header is attacker-controlled and unbounded, and this is
    // only ever shown back to the owner.
    userAgent: request.userAgent?.slice(0, 300) ?? null,
    ip: request.ip?.slice(0, 60) ?? null,
  });
  return { token, session };
}

export type SessionLookup =
  | { readonly ok: true; readonly session: AdminSession; readonly user: AdminUser }
  | { readonly ok: false; readonly reason: SessionFailure };

export type SessionFailure =
  | "no-cookie"
  | "unknown-session"
  | "expired"
  | "wrong-stage"
  | "password-changed"
  | "no-user";

/**
 * Resolves a token to a session and its user, or explains the refusal.
 *
 * Every check here is a reason to refuse, and they are all applied on every
 * request rather than at login. A session that was valid when it was issued is
 * not the same claim as a session that is valid now.
 */
export async function resolveSession(
  repository: AdminAuthRepository,
  token: string | null,
  expected: AdminSessionStage,
): Promise<SessionLookup> {
  if (!token) return { ok: false, reason: "no-cookie" };

  const session = await repository.getSession(await hashToken(token));
  if (!session) return { ok: false, reason: "unknown-session" };

  if (Date.parse(session.expiresAt) <= Date.now()) {
    // Deleted rather than left to the sweep: the row is useless and its
    // continued existence is one more thing that could be mistakenly trusted.
    await repository.deleteSession(session.id);
    return { ok: false, reason: "expired" };
  }

  if (session.stage !== expected) return { ok: false, reason: "wrong-stage" };

  const user = await repository.getUserById(session.userId);
  if (!user) return { ok: false, reason: "no-user" };

  /*
    The password has changed since this session was issued.

    This is what logs out every other browser when the owner changes their
    password — including the one they are worried about, which is the entire
    reason a person changes a password in a hurry. Comparing a version beats
    deleting rows at change time: it cannot miss a session, and it keeps
    working if a delete ever fails halfway.
  */
  if (session.passwordVersion !== user.passwordVersion) {
    await repository.deleteSession(session.id);
    return { ok: false, reason: "password-changed" };
  }

  return { ok: true, session, user };
}
