/**
 * Internal SQL helpers. Not part of the package's public API.
 *
 * The rule this file exists to enforce: **no caller-supplied string ever
 * reaches an SQL string**. Values are always bound as parameters, and the
 * only identifiers that can appear in generated SQL are ones written
 * literally in a repository's own allowlist.
 */

import type { D1Like, D1PreparedStatement } from "../d1.ts";

/**
 * Maps a patch field name to the column it writes and how to encode it.
 *
 * Repositories declare one of these per updatable field. Because the column
 * name comes from this table — written by us, in source — and never from the
 * incoming patch object, a hostile key like
 * `"title = '', is_featured = 1 --"` cannot become SQL. It simply fails to
 * match a declared field and is ignored.
 */
export interface FieldSpec<TPatch> {
  readonly column: string;
  readonly encode: (patch: TPatch) => unknown;
}

export type FieldSpecs<TPatch> = {
  readonly [K in keyof TPatch & string]?: FieldSpec<TPatch>;
};

export interface PatchClause {
  readonly assignments: string;
  readonly values: unknown[];
  readonly isEmpty: boolean;
}

/**
 * Build a SET clause from a patch, using only allowlisted columns.
 *
 * `undefined` means "field not provided" and is skipped; `null` on a
 * nullable field means "clear this value" and is bound as SQL NULL. That
 * distinction is why the patch types use `?: T | null` rather than `?: T`.
 */
export function buildPatch<TPatch extends object>(
  patch: TPatch,
  specs: FieldSpecs<TPatch>,
): PatchClause {
  const parts: string[] = [];
  const values: unknown[] = [];

  for (const [key, spec] of Object.entries(specs) as [
    keyof TPatch & string,
    FieldSpec<TPatch> | undefined,
  ][]) {
    if (!spec) continue;
    if (!(key in patch)) continue;
    if ((patch as Record<string, unknown>)[key] === undefined) continue;

    parts.push(`${spec.column} = ?`);
    values.push(spec.encode(patch));
  }

  return {
    assignments: parts.join(", "),
    values,
    isEmpty: parts.length === 0,
  };
}

/** Encode a domain boolean as the schema's INTEGER 0/1. */
export function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Render a placeholder list (`?, ?, ?`) for an IN clause.
 *
 * Only the *count* influences the SQL; the values themselves are bound. An
 * empty list would produce `IN ()`, which is a syntax error, so callers must
 * check for that case — every call site here does.
 */
export function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

/** Clamp a caller-supplied limit into a sane, bounded range. */
export function normalizeLimit(limit: number | undefined, fallback = 100): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1) return fallback;
  return Math.min(limit, 500);
}

export function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) return 0;
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return offset;
}

/** Run a statement and return the number of rows it changed. */
export async function runChanges(
  statement: D1PreparedStatement,
): Promise<number> {
  const result = await statement.run();
  return result.meta?.changes ?? 0;
}

export type { D1Like };
