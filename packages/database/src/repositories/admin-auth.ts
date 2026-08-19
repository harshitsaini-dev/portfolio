/**
 * Admin authentication storage: users, sessions, verification codes, limits.
 *
 * Persistence only. Nothing here hashes a password, generates a token, sends
 * an email or decides whether a login should be allowed — those belong to the
 * app, and keeping them out means this file reads as exactly what it is: four
 * tables and the queries against them.
 *
 * ## What this layer refuses to accept
 *
 * A plaintext password, session token or verification code. Callers hash
 * before they get here. That is not politeness about layering: it means no
 * replayable credential ever exists inside the repository boundary, so no
 * future log line, error message or test fixture in this package can leak one.
 */

import type {
  AdminRateLimitState,
  AdminSession,
  AdminSessionCreate,
  AdminUser,
  AdminUserCreate,
  AdminVerificationCode,
  AdminVerificationCodeCreate,
  AdminCodePurpose,
} from "@portfolio/types";
import { ADMIN_CODE_PURPOSES, ADMIN_SESSION_STAGES } from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireEnum,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const USER_ENTITY = "admin_user";
const SESSION_ENTITY = "admin_session";
const CODE_ENTITY = "admin_verification_code";
const LIMIT_ENTITY = "admin_rate_limit";

const USER_COLUMNS = `id, email, password_hash, password_salt,
  password_iterations, password_version, created_at, updated_at, last_login_at`;

const SESSION_COLUMNS = `id, user_id, stage, password_version, created_at,
  expires_at, last_seen_at, user_agent, ip`;

const CODE_COLUMNS = `id, user_id, session_id, purpose, code_hash, created_at,
  expires_at, attempts, consumed_at`;

function toUser(row: Row): AdminUser {
  return {
    id: requireString(USER_ENTITY, row, "id"),
    email: requireString(USER_ENTITY, row, "email"),
    passwordHash: requireString(USER_ENTITY, row, "password_hash"),
    passwordSalt: requireString(USER_ENTITY, row, "password_salt"),
    passwordIterations: requireNumber(USER_ENTITY, row, "password_iterations"),
    passwordVersion: requireNumber(USER_ENTITY, row, "password_version"),
    createdAt: requireString(USER_ENTITY, row, "created_at"),
    updatedAt: requireString(USER_ENTITY, row, "updated_at"),
    lastLoginAt: nullableString(USER_ENTITY, row, "last_login_at"),
  };
}

function toSession(row: Row): AdminSession {
  return {
    id: requireString(SESSION_ENTITY, row, "id"),
    userId: requireString(SESSION_ENTITY, row, "user_id"),
    stage: requireEnum(SESSION_ENTITY, row, "stage", ADMIN_SESSION_STAGES),
    passwordVersion: requireNumber(SESSION_ENTITY, row, "password_version"),
    createdAt: requireString(SESSION_ENTITY, row, "created_at"),
    expiresAt: requireString(SESSION_ENTITY, row, "expires_at"),
    lastSeenAt: requireString(SESSION_ENTITY, row, "last_seen_at"),
    userAgent: nullableString(SESSION_ENTITY, row, "user_agent"),
    ip: nullableString(SESSION_ENTITY, row, "ip"),
  };
}

function toCode(row: Row): AdminVerificationCode {
  return {
    id: requireString(CODE_ENTITY, row, "id"),
    userId: requireString(CODE_ENTITY, row, "user_id"),
    sessionId: nullableString(CODE_ENTITY, row, "session_id"),
    purpose: requireEnum(CODE_ENTITY, row, "purpose", ADMIN_CODE_PURPOSES),
    codeHash: requireString(CODE_ENTITY, row, "code_hash"),
    createdAt: requireString(CODE_ENTITY, row, "created_at"),
    expiresAt: requireString(CODE_ENTITY, row, "expires_at"),
    attempts: requireNumber(CODE_ENTITY, row, "attempts"),
    consumedAt: nullableString(CODE_ENTITY, row, "consumed_at"),
  };
}

export interface AdminAuthRepository {
  /** The administrator, by lower-cased email. Null when unknown. */
  getUserByEmail(email: string): Promise<AdminUser | null>;
  getUserById(id: string): Promise<AdminUser | null>;
  /** True when any administrator exists — the bootstrap check. */
  hasAnyUser(): Promise<boolean>;
  createUser(input: AdminUserCreate): Promise<AdminUser>;
  /**
   * Replaces the stored derived key, salt and iteration count, and bumps
   * `password_version` so sessions issued under the old one stop verifying.
   */
  setPassword(
    userId: string,
    hash: string,
    salt: string,
    iterations: number,
  ): Promise<AdminUser>;
  markLoggedIn(userId: string): Promise<void>;

  createSession(input: AdminSessionCreate): Promise<AdminSession>;
  /** By the *hash* of the cookie value. The cookie itself never arrives here. */
  getSession(id: string): Promise<AdminSession | null>;
  /** Promotes a session once its code has been accepted. */
  setSessionStage(
    id: string,
    stage: AdminSession["stage"],
    expiresAt: string,
  ): Promise<void>;
  touchSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** Every session for a user, optionally sparing one. */
  deleteSessionsForUser(userId: string, exceptId?: string): Promise<number>;
  /** Housekeeping. Expired rows are already rejected by the guard. */
  deleteExpiredSessions(): Promise<number>;

  /** Replaces any live code for the same user and purpose. */
  createCode(input: AdminVerificationCodeCreate): Promise<AdminVerificationCode>;
  getLiveCode(
    userId: string,
    purpose: AdminCodePurpose,
  ): Promise<AdminVerificationCode | null>;
  /** Returns the new attempt count, so the caller can enforce the cap. */
  recordCodeAttempt(id: string): Promise<number>;
  consumeCode(id: string): Promise<void>;
  deleteExpiredCodes(): Promise<number>;

  /** The current counter for a bucket, or null when it has never been used. */
  getRateLimit(bucket: string): Promise<AdminRateLimitState | null>;
  /** Sets counter, window start and block expiry in one write. */
  putRateLimit(state: AdminRateLimitState): Promise<void>;
  clearRateLimit(bucket: string): Promise<void>;
}

export function createAdminAuthRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): AdminAuthRepository {
  const repository: AdminAuthRepository = {
    async getUserByEmail(email) {
      try {
        const row = await db
          .prepare(`SELECT ${USER_COLUMNS} FROM admin_users WHERE email = ?`)
          // Lower-cased here as well as by the caller. This is the lookup that
          // decides whether an account exists, and a case mismatch would read
          // as "no such user" rather than as the bug it is.
          .bind(email.trim().toLowerCase())
          .first<Row>();
        return row ? toUser(row) : null;
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "read", cause);
      }
    },

    async getUserById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${USER_COLUMNS} FROM admin_users WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toUser(row) : null;
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "read", cause);
      }
    },

    async hasAnyUser() {
      try {
        const row = await db
          .prepare("SELECT 1 AS present FROM admin_users LIMIT 1")
          .first<Row>();
        return row !== null;
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "read", cause);
      }
    },

    async createUser(input) {
      const now = runtime.now();
      const id = runtime.newId();
      try {
        await db
          .prepare(
            `INSERT INTO admin_users
               (id, email, password_hash, password_salt, password_iterations,
                password_version, created_at, updated_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
          )
          .bind(
            id,
            input.email.trim().toLowerCase(),
            input.passwordHash,
            input.passwordSalt,
            input.passwordIterations,
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "write", cause);
      }
      const created = await repository.getUserById(id);
      if (!created) throw toDatabaseError(USER_ENTITY, "read", null);
      return created;
    },

    async setPassword(userId, hash, salt, iterations) {
      try {
        await db
          .prepare(
            `UPDATE admin_users
                SET password_hash = ?, password_salt = ?,
                    password_iterations = ?,
                    password_version = password_version + 1,
                    updated_at = ?
              WHERE id = ?`,
          )
          .bind(hash, salt, iterations, runtime.now(), userId)
          .run();
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "write", cause);
      }
      const updated = await repository.getUserById(userId);
      if (!updated) throw toDatabaseError(USER_ENTITY, "read", null);
      return updated;
    },

    async markLoggedIn(userId) {
      try {
        await db
          .prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?")
          .bind(runtime.now(), userId)
          .run();
      } catch (cause) {
        throw toDatabaseError(USER_ENTITY, "write", cause);
      }
    },

    async createSession(input) {
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO admin_sessions
               (id, user_id, stage, password_version, created_at, expires_at,
                last_seen_at, user_agent, ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.id,
            input.userId,
            input.stage,
            input.passwordVersion,
            now,
            input.expiresAt,
            now,
            input.userAgent ?? null,
            input.ip ?? null,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
      const created = await repository.getSession(input.id);
      if (!created) throw toDatabaseError(SESSION_ENTITY, "read", null);
      return created;
    },

    async getSession(id) {
      try {
        const row = await db
          .prepare(`SELECT ${SESSION_COLUMNS} FROM admin_sessions WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toSession(row) : null;
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "read", cause);
      }
    },

    async setSessionStage(id, stage, expiresAt) {
      try {
        await db
          .prepare(
            `UPDATE admin_sessions
                SET stage = ?, expires_at = ?, last_seen_at = ?
              WHERE id = ?`,
          )
          .bind(stage, expiresAt, runtime.now(), id)
          .run();
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
    },

    async touchSession(id) {
      try {
        await db
          .prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?")
          .bind(runtime.now(), id)
          .run();
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
    },

    async deleteSession(id) {
      try {
        await db
          .prepare("DELETE FROM admin_sessions WHERE id = ?")
          .bind(id)
          .run();
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
    },

    async deleteSessionsForUser(userId, exceptId) {
      try {
        const result = exceptId
          ? await db
              .prepare(
                "DELETE FROM admin_sessions WHERE user_id = ? AND id <> ?",
              )
              .bind(userId, exceptId)
              .run()
          : await db
              .prepare("DELETE FROM admin_sessions WHERE user_id = ?")
              .bind(userId)
              .run();
        return result.meta?.changes ?? 0;
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
    },

    async deleteExpiredSessions() {
      try {
        const result = await db
          .prepare("DELETE FROM admin_sessions WHERE expires_at < ?")
          .bind(runtime.now())
          .run();
        return result.meta?.changes ?? 0;
      } catch (cause) {
        throw toDatabaseError(SESSION_ENTITY, "write", cause);
      }
    },

    async createCode(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        // One live code per user and purpose. Asking for a second replaces the
        // first rather than adding to it — otherwise requesting codes
        // repeatedly would widen the set of values that unlock the account.
        await db
          .prepare(
            "DELETE FROM admin_verification_codes WHERE user_id = ? AND purpose = ?",
          )
          .bind(input.userId, input.purpose)
          .run();
        await db
          .prepare(
            `INSERT INTO admin_verification_codes
               (id, user_id, session_id, purpose, code_hash, created_at,
                expires_at, attempts, consumed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
          )
          .bind(
            id,
            input.userId,
            input.sessionId ?? null,
            input.purpose,
            input.codeHash,
            now,
            input.expiresAt,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(CODE_ENTITY, "write", cause);
      }
      const created = await repository.getLiveCode(input.userId, input.purpose);
      if (!created) throw toDatabaseError(CODE_ENTITY, "read", null);
      return created;
    },

    async getLiveCode(userId, purpose) {
      try {
        const row = await db
          .prepare(
            `SELECT ${CODE_COLUMNS} FROM admin_verification_codes
              WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
              ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(userId, purpose)
          .first<Row>();
        return row ? toCode(row) : null;
      } catch (cause) {
        throw toDatabaseError(CODE_ENTITY, "read", cause);
      }
    },

    async recordCodeAttempt(id) {
      try {
        const row = await db
          .prepare(
            `UPDATE admin_verification_codes SET attempts = attempts + 1
              WHERE id = ?
             RETURNING attempts`,
          )
          .bind(id)
          .first<Row>();
        return row ? requireNumber(CODE_ENTITY, row, "attempts") : 0;
      } catch (cause) {
        throw toDatabaseError(CODE_ENTITY, "write", cause);
      }
    },

    async consumeCode(id) {
      try {
        await db
          .prepare(
            "UPDATE admin_verification_codes SET consumed_at = ? WHERE id = ?",
          )
          .bind(runtime.now(), id)
          .run();
      } catch (cause) {
        throw toDatabaseError(CODE_ENTITY, "write", cause);
      }
    },

    async deleteExpiredCodes() {
      try {
        const result = await db
          .prepare("DELETE FROM admin_verification_codes WHERE expires_at < ?")
          .bind(runtime.now())
          .run();
        return result.meta?.changes ?? 0;
      } catch (cause) {
        throw toDatabaseError(CODE_ENTITY, "write", cause);
      }
    },

    async getRateLimit(bucket) {
      try {
        const row = await db
          .prepare(
            `SELECT bucket, count, window_started_at, blocked_until
               FROM admin_rate_limits WHERE bucket = ?`,
          )
          .bind(bucket)
          .first<Row>();
        if (!row) return null;
        return {
          bucket: requireString(LIMIT_ENTITY, row, "bucket"),
          count: requireNumber(LIMIT_ENTITY, row, "count"),
          windowStartedAt: requireString(LIMIT_ENTITY, row, "window_started_at"),
          blockedUntil: nullableString(LIMIT_ENTITY, row, "blocked_until"),
        };
      } catch (cause) {
        throw toDatabaseError(LIMIT_ENTITY, "read", cause);
      }
    },

    async putRateLimit(state) {
      try {
        await db
          .prepare(
            `INSERT INTO admin_rate_limits
               (bucket, count, window_started_at, blocked_until)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(bucket) DO UPDATE SET
               count = excluded.count,
               window_started_at = excluded.window_started_at,
               blocked_until = excluded.blocked_until`,
          )
          .bind(
            state.bucket,
            state.count,
            state.windowStartedAt,
            state.blockedUntil ?? null,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(LIMIT_ENTITY, "write", cause);
      }
    },

    async clearRateLimit(bucket) {
      try {
        await db
          .prepare("DELETE FROM admin_rate_limits WHERE bucket = ?")
          .bind(bucket)
          .run();
      } catch (cause) {
        throw toDatabaseError(LIMIT_ENTITY, "write", cause);
      }
    },
  };

  return repository;
}
