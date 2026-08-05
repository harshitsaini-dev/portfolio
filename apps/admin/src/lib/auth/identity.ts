/**
 * The admin identity model.
 *
 * Deliberately tiny. The Access JWT carries a lot — issuer, audience list,
 * nonce, device posture, custom claims — and none of that belongs in the
 * UI. Components get a normalized identity with the three things they
 * actually need, so a claim shape change is a one-file problem rather than
 * a grep across the app.
 *
 * Nothing here is a secret, but it is still server-derived: the identity is
 * produced inside the auth boundary and passed down as plain props. The raw
 * token never leaves `verify.ts`.
 */

/** How the current identity was established. */
export type AdminAuthSource =
  /** Verified Cloudflare Access application JWT. The only production path. */
  | "cloudflare-access"
  /** Local development identity. Never reachable in a production build. */
  | "development";

export interface AdminIdentity {
  /**
   * Stable subject identifier from the Access token (`sub`), or a fixed
   * development value. Not an email, and not guaranteed human-readable.
   */
  readonly subject: string;
  /** Present when Access supplies it; Access tokens for humans normally do. */
  readonly email: string | null;
  readonly source: AdminAuthSource;
}

/** True when this identity came from a real verified Access token. */
export function isProductionIdentity(identity: AdminIdentity): boolean {
  return identity.source === "cloudflare-access";
}

/**
 * Short label for the identity, for display only.
 *
 * Falls back to a truncated subject rather than showing a raw opaque id in
 * full — it is not sensitive, but it is noise.
 */
export function identityLabel(identity: AdminIdentity): string {
  if (identity.email) return identity.email;
  return identity.subject.length > 12
    ? `${identity.subject.slice(0, 12)}…`
    : identity.subject;
}
