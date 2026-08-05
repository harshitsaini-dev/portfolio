/**
 * Authentication configuration and environment classification.
 *
 * Two jobs, both security-critical:
 *
 *   1. Read the Cloudflare Access settings, and report *missing* rather
 *      than substituting a default. A default audience would mean happily
 *      accepting tokens minted for somebody else's Access application.
 *   2. Decide whether the development identity is permitted — under rules
 *      that a single environment variable cannot satisfy on its own.
 *
 * Server-only. Nothing here may be imported from a Client Component; the
 * values are configuration, and the decision logic must not be shippable.
 */

import "server-only";

export interface AccessConfig {
  /** e.g. `example.cloudflareaccess.com` — used to derive issuer and JWKS. */
  readonly teamDomain: string;
  /** The Access application's AUD tag. Scopes tokens to *this* application. */
  readonly audience: string;
}

export type AccessConfigResult =
  | { readonly ok: true; readonly config: AccessConfig }
  | { readonly ok: false; readonly reason: string };

/**
 * Read Access configuration from the environment.
 *
 * Returns a reason instead of throwing so the caller can fail closed and
 * log the cause without turning a misconfiguration into a stack trace in
 * front of a user.
 */
export function readAccessConfig(
  env: NodeJS.ProcessEnv = process.env,
): AccessConfigResult {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();

  if (!teamDomain) {
    return { ok: false, reason: "CF_ACCESS_TEAM_DOMAIN is not set" };
  }
  if (!audience) {
    return { ok: false, reason: "CF_ACCESS_AUD is not set" };
  }

  return { ok: true, config: { teamDomain, audience } };
}

/** The issuer Access stamps into tokens for a team domain. */
export function accessIssuer(config: AccessConfig): string {
  return `https://${config.teamDomain}`;
}

/** Where Access publishes the public keys for a team domain. */
export function accessJwksUrl(config: AccessConfig): URL {
  return new URL(`https://${config.teamDomain}/cdn-cgi/access/certs`);
}

/**
 * Whether the development identity may be used.
 *
 * **Three independent conditions, all required.** This is the guard that
 * keeps a convenience feature from becoming a production bypass:
 *
 *   1. `process.env.NODE_ENV !== "production"`. Next.js hard-codes this to
 *      `"production"` at build time for `next build`, so a production
 *      bundle cannot be talked out of it by the runtime environment — the
 *      dead branch is compiled away.
 *   2. `ADMIN_DEV_AUTH === "enabled"`, an explicit opt-in. Off by default,
 *      so a development machine with no configuration is still locked.
 *   3. Access must NOT be configured. If real Access settings are present,
 *      the developer is pointing at a real Access application and the
 *      development path steps aside rather than shadowing it.
 *
 * Setting one environment variable is therefore not enough, and in a
 * production build no combination of variables is enough.
 */
export function isDevelopmentAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.ADMIN_DEV_AUTH !== "enabled") return false;
  if (readAccessConfig(env).ok) return false;
  return true;
}

/**
 * The development identity's email, if the developer set one.
 *
 * A convenience label only — it grants nothing, and is not a credential.
 */
export function developmentEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.ADMIN_DEV_EMAIL?.trim();
  return value && value.length > 0 ? value : null;
}
