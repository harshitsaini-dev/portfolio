/**
 * Row decoding.
 *
 * Every value read out of D1 passes through here on its way to a domain
 * type. Nothing is cast with `as Entity`: SQLite hands back `unknown`-shaped
 * records, and quietly asserting a shape onto them means a schema drift or a
 * bad write surfaces later as a confusing runtime bug somewhere in the UI
 * instead of immediately, at the boundary that owns the contract.
 *
 * When a column violates the contract these helpers throw
 * `InvalidPersistedDataError` rather than substituting a default. A missing
 * required string is a real problem; manufacturing `""` hides it.
 */

import { InvalidPersistedDataError } from "./errors.ts";

export type Row = Record<string, unknown>;

export function requireString(entity: string, row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new InvalidPersistedDataError(
      entity,
      `column \`${column}\` should be a string, got ${describe(value)}`,
    );
  }
  return value;
}

export function nullableString(
  entity: string,
  row: Row,
  column: string,
): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new InvalidPersistedDataError(
      entity,
      `column \`${column}\` should be a string or null, got ${describe(value)}`,
    );
  }
  return value;
}

export function requireNumber(entity: string, row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidPersistedDataError(
      entity,
      `column \`${column}\` should be a finite number, got ${describe(value)}`,
    );
  }
  return value;
}

export function nullableNumber(
  entity: string,
  row: Row,
  column: string,
): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  return requireNumber(entity, row, column);
}

/**
 * SQLite has no boolean type; the schema stores 0/1 and constrains it with a
 * CHECK. Anything else means the CHECK was bypassed or the schema changed,
 * so it is an error rather than a truthiness coercion.
 */
export function requireBoolean(entity: string, row: Row, column: string): boolean {
  const value = row[column];
  if (value === 0 || value === 1) return value === 1;
  // Some drivers surface INTEGER as bigint.
  if (value === 0n || value === 1n) return value === 1n;
  throw new InvalidPersistedDataError(
    entity,
    `column \`${column}\` should be integer 0 or 1, got ${describe(value)}`,
  );
}

/** Decode a TEXT column constrained to a known set of values. */
export function requireEnum<T extends string>(
  entity: string,
  row: Row,
  column: string,
  allowed: readonly T[],
): T {
  const value = requireString(entity, row, column);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new InvalidPersistedDataError(
      entity,
      `column \`${column}\` has unexpected value; allowed: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

/** Describe a value for an error message without leaking its contents. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined (column absent)";
  return typeof value;
}
