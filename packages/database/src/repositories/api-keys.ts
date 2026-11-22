import type { ApiKey, ApiKeyCreate, ApiKeyScope } from "@portfolio/types";
import { API_KEY_SCOPES } from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { InvalidPersistedDataError, toDatabaseError } from "../errors.ts";
import { nullableString, requireString, type Row } from "../mapping.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "api_key";

const COLUMNS = `id, name, prefix, token_hash, scopes, created_at, expires_at,
  last_used_at, revoked_at`;

/**
 * Decode the space-separated scope list.
 *
 * Strict on purpose: a word that is not a known scope is a corrupt row, and a
 * corrupt row must fail the decode rather than quietly authorise the parts of
 * it that happened to parse.
 */
function decodeScopes(raw: string): ApiKeyScope[] {
  const words = raw.split(" ").filter((word) => word.length > 0);
  for (const word of words) {
    if (!(API_KEY_SCOPES as readonly string[]).includes(word)) {
      throw new InvalidPersistedDataError(
        ENTITY,
        `column \`scopes\` has unexpected value; allowed: ${API_KEY_SCOPES.join(", ")}`,
      );
    }
  }
  return words as ApiKeyScope[];
}

function toApiKey(row: Row): ApiKey {
  return {
    id: requireString(ENTITY, row, "id"),
    name: requireString(ENTITY, row, "name"),
    prefix: requireString(ENTITY, row, "prefix"),
    tokenHash: requireString(ENTITY, row, "token_hash"),
    scopes: decodeScopes(requireString(ENTITY, row, "scopes")),
    createdAt: requireString(ENTITY, row, "created_at"),
    expiresAt: nullableString(ENTITY, row, "expires_at"),
    lastUsedAt: nullableString(ENTITY, row, "last_used_at"),
    revokedAt: nullableString(ENTITY, row, "revoked_at"),
  };
}

/** A SHA-256 hex digest: the only shape `tokenHash` may take. */
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface ApiKeyRepository {
  /** Newest first, revoked included. */
  list(): Promise<ApiKey[]>;
  getById(id: string): Promise<ApiKey | null>;
  /** The authentication lookup. Expects the hash, never the key. */
  getByTokenHash(tokenHash: string): Promise<ApiKey | null>;
  create(input: ApiKeyCreate): Promise<ApiKey>;
  /** Idempotent. Returns false when no such key exists. */
  revoke(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  /** Records use, at most once per `minIntervalMs`. */
  touch(id: string, minIntervalMs?: number): Promise<void>;
}

export function createApiKeyRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ApiKeyRepository {
  const repository: ApiKeyRepository = {
    async list() {
      try {
        const result = await db
          .prepare(`SELECT ${COLUMNS} FROM api_keys ORDER BY created_at DESC, id DESC`)
          .all<Row>();
        return (result.results ?? []).map(toApiKey);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM api_keys WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toApiKey(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async getByTokenHash(tokenHash) {
      // Anything that is not a digest cannot match one. Refusing it here keeps
      // a caller that passed the raw key by mistake from ever querying with it.
      if (!TOKEN_HASH_PATTERN.test(tokenHash)) return null;
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM api_keys WHERE token_hash = ?`)
          .bind(tokenHash)
          .first<Row>();
        return row ? toApiKey(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async create(input) {
      if (!TOKEN_HASH_PATTERN.test(input.tokenHash)) {
        // The same guard 0018's repository has: a plaintext key must never
        // reach a column, whatever the caller got wrong.
        throw new TypeError("api_key: tokenHash must be a SHA-256 hex digest");
      }
      const id = runtime.newId();
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO api_keys
               (id, name, prefix, token_hash, scopes, created_at, expires_at,
                last_used_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
          )
          .bind(
            id,
            input.name,
            input.prefix,
            input.tokenHash,
            [...new Set(input.scopes)].join(" "),
            now,
            input.expiresAt,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "write", cause);
      }
      const created = await repository.getById(id);
      if (!created) throw toDatabaseError(ENTITY, "read", null);
      return created;
    },

    async revoke(id) {
      try {
        const result = await db
          .prepare(
            `UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?`,
          )
          .bind(runtime.now(), id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "write", cause);
      }
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM api_keys WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "write", cause);
      }
    },

    async touch(id, minIntervalMs = 60_000) {
      const now = runtime.now();
      const threshold = new Date(Date.parse(now) - minIntervalMs).toISOString();
      try {
        await db
          .prepare(
            `UPDATE api_keys SET last_used_at = ?
              WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`,
          )
          .bind(now, id, threshold)
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "write", cause);
      }
    },
  };
  return repository;
}
