/**
 * A `D1Like` adapter over Node's built-in `node:sqlite`.
 *
 * Why this exists: the repository tests need to run the *actual repository
 * code* against a real SQL engine executing the real migration. Driving
 * `wrangler d1 execute` from the outside cannot do that — it only runs SQL
 * strings, so it would test a transcription of the repositories rather than
 * the repositories themselves.
 *
 * Why `node:sqlite` rather than Miniflare: it is built into Node 22+, so it
 * adds no dependency, starts in milliseconds, and needs no Cloudflare
 * authentication or network. D1 is SQLite underneath, and the repositories
 * only ever touch the small `D1Like` surface this file implements.
 *
 * HONEST LIMITS — this is not workerd:
 *   * Constraint *messages* come from SQLite directly. They match the text
 *     D1 surfaces closely enough for `toDatabaseError` classification, but
 *     they are not guaranteed identical.
 *   * `batch()` here is a real `BEGIN`/`COMMIT`/`ROLLBACK` transaction,
 *     which is what D1 documents. That behaviour is asserted locally but is
 *     NOT verified against remote D1 in this phase.
 *   * Foreign keys must be switched on explicitly; D1 has them on already.
 *     The adapter enables them so semantics line up.
 *
 * Schema correctness itself keeps its real-D1 proof: the separate migration
 * smoke test still runs the migration through Wrangler/workerd.
 */

import { DatabaseSync } from "node:sqlite";

class PreparedStatement {
  #db;
  #sql;
  #values;

  constructor(db, sql, values = []) {
    this.#db = db;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values) {
    return new PreparedStatement(this.#db, this.#sql, values);
  }

  #statement() {
    return this.#db.prepare(this.#sql);
  }

  async first() {
    const row = this.#statement().get(...this.#values);
    return row === undefined ? null : row;
  }

  async all() {
    const results = this.#statement().all(...this.#values);
    return { results, success: true, meta: { rows_read: results.length } };
  }

  async run() {
    const info = this.#statement().run(...this.#values);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }

  /** Internal: used by batch() to execute inside an open transaction. */
  _execute() {
    const statement = this.#statement();
    const info = statement.run(...this.#values);
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes ?? 0) },
    };
  }
}

export function createTestD1(sqlite) {
  return {
    prepare(sql) {
      return new PreparedStatement(sqlite, sql);
    },

    async batch(statements) {
      // D1 documents batch() as a single implicit transaction: all
      // statements commit together, or none do. Mirrored here so the
      // repositories' relationship-replace operations are exercised under
      // the same guarantee they rely on in production.
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement._execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

/** Open an in-memory database with D1-equivalent pragmas and a schema applied. */
export function openTestDatabase(migrationSql) {
  const sqlite = new DatabaseSync(":memory:");
  // D1 enforces foreign keys by default; plain SQLite does not.
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(migrationSql);
  return { sqlite, db: createTestD1(sqlite) };
}
