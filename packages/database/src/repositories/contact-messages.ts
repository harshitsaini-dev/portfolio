/**
 * Contact inbox repository.
 *
 * Persistence only. Nothing here sends email, validates a submission against
 * spam rules, or renders anything — that is Phase 11.
 */

import {
  CONTACT_MESSAGE_STATUSES,
  type ContactMessage,
  type ContactMessageCreate,
  type ContactMessageListOptions,
  type ContactMessageStatus,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { ConflictError, NotFoundError, toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireEnum,
  requireString,
  type Row,
} from "../mapping.ts";
import {
  normalizeLimit,
  normalizeOffset,
  placeholders,
} from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "contact_message";
const COLUMNS = `id, sender_name, sender_email, subject, body, status,
  source_country, created_at, read_at`;

function toMessage(row: Row): ContactMessage {
  return {
    id: requireString(ENTITY, row, "id"),
    senderName: requireString(ENTITY, row, "sender_name"),
    senderEmail: requireString(ENTITY, row, "sender_email"),
    subject: nullableString(ENTITY, row, "subject"),
    body: requireString(ENTITY, row, "body"),
    status: requireEnum(ENTITY, row, "status", CONTACT_MESSAGE_STATUSES),
    sourceCountry: nullableString(ENTITY, row, "source_country"),
    createdAt: requireString(ENTITY, row, "created_at"),
    readAt: nullableString(ENTITY, row, "read_at"),
  };
}

export interface ContactMessageRepository {
  getById(id: string): Promise<ContactMessage | null>;
  /** Newest first, matching the `(status, created_at DESC)` index. */
  list(options?: ContactMessageListOptions): Promise<ContactMessage[]>;
  create(input: ContactMessageCreate): Promise<ContactMessage>;
  /** Sets `read_at` automatically on the first transition to `read`. */
  setStatus(id: string, status: ContactMessageStatus): Promise<ContactMessage>;
  delete(id: string): Promise<boolean>;
}

export function createContactMessageRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ContactMessageRepository {
  const repository: ContactMessageRepository = {
    async getById(id) {
      try {
        const row = await db
          .prepare(`SELECT ${COLUMNS} FROM contact_messages WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return row ? toMessage(row) : null;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async list(options) {
      const statuses = options?.statuses;
      const where =
        statuses && statuses.length > 0
          ? `WHERE status IN (${placeholders(statuses.length)})`
          : "";
      const values: unknown[] = statuses ? [...statuses] : [];
      values.push(normalizeLimit(options?.limit), normalizeOffset(options?.offset));

      try {
        const result = await db
          .prepare(
            `SELECT ${COLUMNS} FROM contact_messages ${where}
             ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          )
          .bind(...values)
          .all<Row>();
        return result.results.map(toMessage);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list", cause);
      }
    },

    async create(input) {
      const id = runtime.newId();
      const now = runtime.now();
      try {
        // `status` is always 'unread' on create — a submitter has no say in
        // it, so it is not part of the create input at all.
        await db
          .prepare(
            `INSERT INTO contact_messages
               (id, sender_name, sender_email, subject, body, status,
                source_country, created_at, read_at)
             VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, NULL)`,
          )
          .bind(
            id,
            input.senderName,
            input.senderEmail,
            input.subject ?? null,
            input.body,
            input.sourceCountry ?? null,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "create", cause);
      }
      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async setStatus(id, status) {
      // Checked here as well as by the schema CHECK so a bad value fails
      // before it reaches the database, with a clearer message.
      if (!CONTACT_MESSAGE_STATUSES.includes(status)) {
        throw new ConflictError(
          ENTITY,
          `unknown status; allowed: ${CONTACT_MESSAGE_STATUSES.join(", ")}`,
        );
      }

      try {
        const result = await db
          .prepare(
            `UPDATE contact_messages
             SET status = ?,
                 read_at = CASE
                   WHEN ? = 'read' AND read_at IS NULL THEN ?
                   ELSE read_at
                 END
             WHERE id = ?`,
          )
          .bind(status, status, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) {
          throw new NotFoundError(ENTITY);
        }
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set status", cause);
      }

      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(ENTITY);
      return updated;
    },

    async delete(id) {
      try {
        const result = await db
          .prepare(`DELETE FROM contact_messages WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "delete", cause);
      }
    },
  };

  return repository;
}
