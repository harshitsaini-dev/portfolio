import type {
  Profile,
  ProfileInput,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireString,
  type Row,
} from "../mapping.ts";
import type { RepositoryRuntime } from "../runtime.ts";

/** The only key the schema's CHECK constraint permits. */
const SINGLETON_ID = "singleton";
const ENTITY = "profile";

function toProfile(row: Row): Profile {
  return {
    id: requireString(ENTITY, row, "id"),
    fullName: requireString(ENTITY, row, "full_name"),
    headline: requireString(ENTITY, row, "headline"),
    tagline: nullableString(ENTITY, row, "tagline"),
    bio: nullableString(ENTITY, row, "bio"),
    location: nullableString(ENTITY, row, "location"),
    availability: nullableString(ENTITY, row, "availability"),
    publicEmail: nullableString(ENTITY, row, "public_email"),
    avatarMediaId: nullableString(ENTITY, row, "avatar_media_id"),
    createdAt: requireString(ENTITY, row, "created_at"),
    updatedAt: requireString(ENTITY, row, "updated_at"),
  };
}

/**
 * Profile repository.
 *
 * The table is singleton-key: the schema allows zero or one row and does not
 * guarantee existence. The contract reflects that honestly — `get()` returns
 * `Profile | null` and there is no `getOrThrow` shortcut that would let
 * callers forget the empty case. `upsert()` is the only write, because
 * "create" and "update" are not meaningfully different for a row whose
 * identity is fixed.
 */
export interface ProfileRepository {
  /** Returns `null` when no profile row exists yet. */
  get(): Promise<Profile | null>;
  /** Creates the profile row, or replaces the existing one's content. */
  upsert(input: ProfileInput): Promise<Profile>;
  /** Removes the profile row. Zero rows is a valid state. */
  clear(): Promise<boolean>;
}

export function createProfileRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ProfileRepository {
  return {
    async get() {
      try {
        const row = await db
          .prepare(
            `SELECT id, full_name, headline, tagline, bio, location,
                    availability, public_email, avatar_media_id,
                    created_at, updated_at
             FROM profile WHERE id = ?`,
          )
          .bind(SINGLETON_ID)
          .first<Row>();
        return row ? toProfile(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async upsert(input) {
      const now = runtime.now();
      try {
        // ON CONFLICT keeps created_at from the original insert so the
        // creation time is not silently rewritten on every save.
        await db
          .prepare(
            `INSERT INTO profile
               (id, full_name, headline, tagline, bio, location, availability,
                public_email, avatar_media_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               full_name = excluded.full_name,
               headline = excluded.headline,
               tagline = excluded.tagline,
               bio = excluded.bio,
               location = excluded.location,
               availability = excluded.availability,
               public_email = excluded.public_email,
               avatar_media_id = excluded.avatar_media_id,
               updated_at = excluded.updated_at`,
          )
          .bind(
            SINGLETON_ID,
            input.fullName,
            input.headline,
            input.tagline ?? null,
            input.bio ?? null,
            input.location ?? null,
            input.availability ?? null,
            input.publicEmail ?? null,
            input.avatarMediaId ?? null,
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "upsert", cause);
      }

      const saved = await this.get();
      if (!saved) {
        throw toDatabaseError(
          ENTITY,
          "upsert",
          new Error("row missing immediately after upsert"),
        );
      }
      return saved;
    },

    async clear() {
      try {
        const result = await db
          .prepare(`DELETE FROM profile WHERE id = ?`)
          .bind(SINGLETON_ID)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "delete", cause);
      }
    },
  };
}
