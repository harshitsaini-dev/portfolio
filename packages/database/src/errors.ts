/**
 * Persistence error model.
 *
 * Deliberately small — four cases, distinguished only because a caller can
 * act differently on each:
 *
 *   NotFound        → 404 / "no such record"
 *   Conflict        → 409 / "slug already taken", "would orphan a child"
 *   InvalidData     → 500 + alert: what is stored does not match the schema
 *                     contract, so something wrote bad data or the schema
 *                     drifted. Never surfaced as a user input error.
 *   DatabaseFailure → 500: everything else.
 *
 * Public error messages never contain SQL text, bound parameter values, or
 * driver internals — those leak schema shape and user data into logs and
 * responses. The original error is preserved on `cause` for server-side
 * diagnosis only.
 */

export type DatabaseErrorCode =
  | "not_found"
  | "conflict"
  | "invalid_data"
  | "database_failure";

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  /** Domain entity involved, e.g. `project`. Safe to log and surface. */
  readonly entity: string;

  constructor(
    code: DatabaseErrorCode,
    entity: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions);
    this.name = "DatabaseError";
    this.code = code;
    this.entity = entity;
  }
}

export class NotFoundError extends DatabaseError {
  constructor(entity: string, detail = "not found") {
    super("not_found", entity, `${entity}: ${detail}`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DatabaseError {
  constructor(entity: string, detail: string, options?: { cause?: unknown }) {
    super("conflict", entity, `${entity}: ${detail}`, options);
    this.name = "ConflictError";
  }
}

export class InvalidPersistedDataError extends DatabaseError {
  constructor(entity: string, detail: string) {
    super("invalid_data", entity, `${entity}: ${detail}`);
    this.name = "InvalidPersistedDataError";
  }
}

export class DatabaseFailureError extends DatabaseError {
  constructor(entity: string, detail: string, options?: { cause?: unknown }) {
    super("database_failure", entity, `${entity}: ${detail}`, options);
    this.name = "DatabaseFailureError";
  }
}

/**
 * Classify a driver error into the domain model.
 *
 * SQLite/D1 report constraint violations as message text rather than typed
 * codes, so string matching is unavoidable here. It is confined to this one
 * function, and anything unrecognised degrades to `DatabaseFailureError`
 * rather than being guessed at.
 */
export function toDatabaseError(
  entity: string,
  operation: string,
  cause: unknown,
): DatabaseError {
  if (cause instanceof DatabaseError) {
    return cause;
  }

  const raw = cause instanceof Error ? cause.message : String(cause);
  const text = raw.toLowerCase();

  if (
    text.includes("unique constraint failed") ||
    text.includes("constraint failed: unique")
  ) {
    return new ConflictError(entity, `${operation} violates a uniqueness constraint`, {
      cause,
    });
  }
  if (text.includes("foreign key constraint failed")) {
    return new ConflictError(
      entity,
      `${operation} violates a foreign key constraint`,
      { cause },
    );
  }
  if (text.includes("check constraint failed")) {
    return new ConflictError(
      entity,
      `${operation} violates a value constraint`,
      { cause },
    );
  }
  if (text.includes("constraint failed")) {
    return new ConflictError(entity, `${operation} violates a constraint`, {
      cause,
    });
  }

  // Note: the raw message is intentionally NOT interpolated into the public
  // message — it can contain SQL and bound values.
  return new DatabaseFailureError(entity, `${operation} failed`, { cause });
}
