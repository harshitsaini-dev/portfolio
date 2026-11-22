/**
 * API keys: minting them, and turning an `Authorization` header into a key.
 *
 * ## The format
 *
 * `pfk_` + 43 characters of base64url (32 random bytes). The prefix exists so
 * a key is recognisable in a leaked log or a secret scanner, and so the admin
 * can show which key is which without storing it.
 *
 * ## What is stored
 *
 * The SHA-256 of the whole key and nothing else that would let it be used.
 * A plain hash rather than PBKDF2 is the correct choice here, unlike for the
 * password: the key is 256 bits of randomness, so there is no dictionary to
 * slow an attacker down against, and a fast hash keeps every API call to one
 * indexed lookup.
 *
 * ## Every refusal looks the same
 *
 * Missing, malformed, unknown, revoked and expired all produce the same
 * `unauthorized` outcome for the caller. Which of those it was is only useful
 * to someone trying keys.
 */

import "server-only";

import type { ApiKeyRepository } from "@portfolio/database";
import type { ApiKey, ApiKeyScope } from "@portfolio/types";

import { createSessionToken, hashToken } from "../auth/crypto.ts";

export const API_KEY_PREFIX = "pfk_";

/** How many characters of the key are kept for display. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

/** `pfk_` followed by unpadded base64url. Anything else is not one of ours. */
const KEY_PATTERN = /^pfk_[A-Za-z0-9_-]{43}$/;

export interface MintedKey {
  /** Shown to the owner once, then forgotten. */
  readonly key: string;
  readonly prefix: string;
  readonly tokenHash: string;
}

export async function mintApiKey(): Promise<MintedKey> {
  const key = `${API_KEY_PREFIX}${createSessionToken()}`;
  return {
    key,
    prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
    tokenHash: await hashToken(key),
  };
}

/** Pull the bearer credential out of a request, or null. */
export function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1]! : null;
}

export type KeyOutcome =
  | { readonly ok: true; readonly key: ApiKey }
  | { readonly ok: false };

/**
 * Resolve the key a request presents.
 *
 * Revocation and expiry are checked here, on every call, against the row —
 * not cached — so revoking a key in the admin takes effect on the very next
 * request.
 */
export async function authenticateApiKey(
  request: Request,
  repository: ApiKeyRepository,
  now: Date = new Date(),
): Promise<KeyOutcome> {
  const presented = readBearer(request);
  if (!presented || !KEY_PATTERN.test(presented)) return { ok: false };

  const key = await repository.getByTokenHash(await hashToken(presented));
  if (!key) return { ok: false };
  if (key.revokedAt) return { ok: false };
  if (key.expiresAt && Date.parse(key.expiresAt) <= now.getTime()) {
    return { ok: false };
  }
  return { ok: true, key };
}

export function hasScope(key: ApiKey, scope: ApiKeyScope): boolean {
  return key.scopes.includes(scope);
}
