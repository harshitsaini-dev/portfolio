/**
 * The admin authentication model.
 *
 * Shared between the repository layer and the app so that neither invents its
 * own shape for a row. Nothing here is a secret in a usable form: the two
 * `password*` fields are a PBKDF2 derived key and its salt, and every `*Hash`
 * is a SHA-256 of a value that exists only in a cookie or an inbox.
 *
 * Types, not validation. Anything arriving from a form is parsed by a schema
 * in `@portfolio/schemas` before it is allowed near these.
 */

import type { IsoTimestamp } from "./content.ts";

/**
 * How far a browser has got.
 *
 * Only `active` authorises anything. The other two are tickets to finish one
 * specific flow and are checked for by name where they are permitted:
 *
 *   * `pending` — password accepted, waiting for the emailed login code.
 *   * `reset`   — a forgotten-password code was accepted; permits setting a
 *     new password and nothing else.
 */
export const ADMIN_SESSION_STAGES = ["pending", "reset", "active"] as const;
export type AdminSessionStage = (typeof ADMIN_SESSION_STAGES)[number];

/** What a six-digit code is for. One table, three flows. */
export const ADMIN_CODE_PURPOSES = [
  "login",
  "password_reset",
  "password_change",
] as const;
export type AdminCodePurpose = (typeof ADMIN_CODE_PURPOSES)[number];

export interface AdminUser {
  readonly id: string;
  /** Always lower-cased. The unique index depends on it. */
  readonly email: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly passwordIterations: number;
  /**
   * Bumped on every password change.
   *
   * Sessions carry the value they were issued under, so a change logs out
   * every other browser by comparison rather than by remembering to delete
   * rows — including browsers the owner no longer has access to.
   */
  readonly passwordVersion: number;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly lastLoginAt: IsoTimestamp | null;
}

export interface AdminUserCreate {
  readonly email: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly passwordIterations: number;
}

export interface AdminSession {
  /** The SHA-256 of the cookie value. The cookie itself is never stored. */
  readonly id: string;
  readonly userId: string;
  readonly stage: AdminSessionStage;
  readonly passwordVersion: number;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly lastSeenAt: IsoTimestamp;
  /** Display only. Both are attacker-controlled and authorise nothing. */
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export interface AdminSessionCreate {
  readonly id: string;
  readonly userId: string;
  readonly stage: AdminSessionStage;
  readonly passwordVersion: number;
  readonly expiresAt: IsoTimestamp;
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

export interface AdminVerificationCode {
  readonly id: string;
  readonly userId: string;
  /** Null for a password reset: there is no session until one is granted. */
  readonly sessionId: string | null;
  readonly purpose: AdminCodePurpose;
  readonly codeHash: string;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly attempts: number;
  readonly consumedAt: IsoTimestamp | null;
}

export interface AdminVerificationCodeCreate {
  readonly userId: string;
  readonly sessionId?: string | null;
  readonly purpose: AdminCodePurpose;
  readonly codeHash: string;
  readonly expiresAt: IsoTimestamp;
}

/** One fixed-window counter. See the migration for why the window is fixed. */
export interface AdminRateLimitState {
  readonly bucket: string;
  readonly count: number;
  readonly windowStartedAt: IsoTimestamp;
  readonly blockedUntil: IsoTimestamp | null;
}
