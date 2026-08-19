/**
 * Cloudflare Access application JWT verification.
 *
 * Cloudflare Access is the identity provider: it authenticates the user at
 * the edge and forwards a signed assertion in `Cf-Access-Jwt-Assertion`.
 * This module is the application's own check on that assertion.
 *
 * **Why verify at all, if Access already gated the request?** Because
 * "there is a header" is not authentication. If the Worker is ever reachable
 * by a path that does not traverse the Access edge — a misconfigured route,
 * a direct workers.dev URL, a future preview deployment — an attacker can
 * set that header to anything they like. Verifying the signature, issuer,
 * audience, and expiry means a forged header is worthless. Defence in
 * depth: Access is the gate, this is the lock.
 *
 * Cryptography is delegated to `jose`. Hand-rolling JWT verification is a
 * well-known source of critical bugs — `alg: none` acceptance, HMAC/RSA
 * confusion, unchecked `kid`, missing expiry validation. `jose` is
 * audited, zero-dependency, and runs on Web Crypto, so it works unchanged
 * on Cloudflare Workers.
 *
 * Server-only, and the raw token never leaves this file.
 */

import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import {
  accessIssuer,
  accessJwksUrl,
  readAccessConfig,
  type AccessConfig,
} from "./config.ts";
import type { AdminIdentity } from "./identity.ts";

/** Header Cloudflare Access uses to forward its signed assertion. */
export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

/**
 * Why a verification attempt failed.
 *
 * Coarse on purpose. These are for server logs and tests; the browser is
 * told only that authentication failed, because a precise reason tells an
 * attacker which knob to turn next.
 */
export type AccessFailureReason =
  | "not_configured"
  | "missing_token"
  | "invalid_token"
  /**
   * No usable session cookie.
   *
   * Named separately from `missing_token` because the two send a visitor to
   * different places: an Access failure is somebody else's login screen, and
   * this one is ours.
   */
  | "no_session";

export type AccessVerificationResult =
  | { readonly ok: true; readonly identity: AdminIdentity }
  | { readonly ok: false; readonly reason: AccessFailureReason; readonly detail: string };

/**
 * JWKS clients, cached per team domain.
 *
 * `createRemoteJWKSet` handles fetching, caching, and key rotation. Building
 * a new one per request would refetch the key set every time — slow, and
 * rude to Cloudflare. Keyed by domain so a config change cannot silently
 * reuse the previous team's keys.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(config: AccessConfig) {
  const url = accessJwksUrl(config);
  const key = url.toString();
  let jwks = jwksCache.get(key);
  if (!jwks) {
    jwks = createRemoteJWKSet(url);
    jwksCache.set(key, jwks);
  }
  return jwks;
}

/** Test seam: lets the suite supply a local key set instead of a remote one. */
export type KeyResolver = Parameters<typeof jwtVerify>[1];

export interface VerifyAccessTokenOptions {
  /** Overrides the remote JWKS. Used by tests with locally generated keys. */
  readonly keyResolver?: KeyResolver;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Normalize an Access token payload into the admin identity.
 *
 * Only three fields escape this function. The rest of the payload — every
 * custom claim, the nonce, device posture — stops here.
 */
function toIdentity(payload: JWTPayload): AdminIdentity | null {
  const subject = typeof payload.sub === "string" ? payload.sub : null;
  if (!subject) return null;

  const rawEmail = (payload as { email?: unknown }).email;
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;

  return { subject, email, source: "cloudflare-access" };
}

/**
 * Verify a Cloudflare Access application JWT.
 *
 * Every failure path returns `ok: false`. There is no branch that returns a
 * successful identity without a cryptographically verified token.
 */
export async function verifyAccessToken(
  token: string | null | undefined,
  options: VerifyAccessTokenOptions = {},
): Promise<AccessVerificationResult> {
  const configResult = readAccessConfig(options.env);
  if (!configResult.ok) {
    // Fail closed. No configuration means we cannot know which audience is
    // legitimate, so nothing can be trusted.
    return { ok: false, reason: "not_configured", detail: configResult.reason };
  }

  if (!token || token.trim().length === 0) {
    return { ok: false, reason: "missing_token", detail: "no Access assertion header" };
  }

  const { config } = configResult;

  try {
    const { payload } = await jwtVerify(
      token,
      options.keyResolver ?? getJwks(config),
      {
        issuer: accessIssuer(config),
        audience: config.audience,
        // Access signs with RS256; pinning it prevents an attacker
        // presenting a token signed with an algorithm we did not intend to
        // accept.
        algorithms: ["RS256"],
        // `jose` enforces `exp` and `nbf` by default. Stated explicitly so
        // the intent survives a future refactor.
        clockTolerance: 0,
        requiredClaims: ["exp", "iss", "aud", "sub"],
      },
    );

    const identity = toIdentity(payload);
    if (!identity) {
      return { ok: false, reason: "invalid_token", detail: "token has no usable subject" };
    }

    return { ok: true, identity };
  } catch (cause) {
    // `jose` error messages describe the failure without echoing the token,
    // so this is safe for server logs. It is never returned to the browser.
    const detail = cause instanceof Error ? cause.message : "verification failed";
    return { ok: false, reason: "invalid_token", detail };
  }
}
