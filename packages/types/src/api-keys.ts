import type { IsoTimestamp } from "./content.ts";

/**
 * What an API key may do.
 *
 * - `read`  — every GET on CMS content (not the inbox).
 * - `write` — create, update and delete CMS content. Implies nothing about
 *   the inbox, and does not imply `read`: a key is granted exactly the words
 *   it carries, so the owner can see from the list what each one can do.
 * - `inbox` — read and manage contact-form messages. Separate because those
 *   are other people's names and email addresses, not the owner's content.
 */
export const API_KEY_SCOPES = ["read", "write", "inbox"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** A stored key. The key itself is never part of this — only its hash. */
export interface ApiKey {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly tokenHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp | null;
  readonly lastUsedAt: IsoTimestamp | null;
  readonly revokedAt: IsoTimestamp | null;
}

export interface ApiKeyCreate {
  readonly name: string;
  readonly prefix: string;
  readonly tokenHash: string;
  readonly scopes: readonly ApiKeyScope[];
  readonly expiresAt: IsoTimestamp | null;
}
