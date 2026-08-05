/**
 * Injectable clock and id generator.
 *
 * Both are dependencies rather than ambient calls so repository behaviour is
 * deterministic under test: a test can pin the clock and use a counter for
 * ids, and assert on exact values instead of loosely matching. It also keeps
 * `Date.now()` and randomness out of the repository modules themselves,
 * where they would be invisible and untestable.
 *
 * Generation lives *inside* the repository boundary on purpose. Callers
 * should not have to know that ids are UUIDv7 or that timestamps are
 * ISO-8601 — that is exactly the sort of persistence detail this layer
 * exists to own. See docs/DECISIONS.md.
 */

/** Returns the current time as an ISO-8601 UTC string with milliseconds. */
export type Clock = () => string;

/**
 * Returns a fresh unique identifier.
 *
 * The optional millisecond argument exists only so time-ordered
 * implementations can be tested deterministically; callers never pass it.
 */
export type IdGenerator = (millisOverride?: number) => string;

export const systemClock: Clock = () => new Date().toISOString();

/**
 * Web Crypto's `getRandomValues`, declared minimally rather than by pulling
 * in the DOM lib (which would also drag in hundreds of browser globals that
 * have no business being visible in an edge/data package). The global exists
 * in Cloudflare Workers, Node 18+, Deno, and browsers.
 */
declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
};

/**
 * UUIDv7: 48-bit big-endian Unix millisecond timestamp, 4-bit version, 12
 * bits of randomness, 2-bit variant, then 62 more bits of randomness.
 *
 * Implemented here rather than pulled from a package: it is a dozen lines,
 * it uses only Web Crypto (available in Workers, Node, and browsers), and
 * adding a dependency to an edge bundle for this would be poor value.
 * Time-ordered ids also index better than v4 — the reason Phase 4 chose v7.
 */
export const uuidV7: IdGenerator = (millisOverride?: number) => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // The timestamp is injectable purely so the encoding can be asserted
  // exactly in tests. Production always uses the default.
  const millis = BigInt(millisOverride ?? Date.now());
  bytes[0] = Number((millis >> 40n) & 0xffn);
  bytes[1] = Number((millis >> 32n) & 0xffn);
  bytes[2] = Number((millis >> 24n) & 0xffn);
  bytes[3] = Number((millis >> 16n) & 0xffn);
  bytes[4] = Number((millis >> 8n) & 0xffn);
  bytes[5] = Number(millis & 0xffn);

  // Version 7 in the high nibble of byte 6.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  // RFC 4122 variant in the top two bits of byte 8.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export interface RepositoryRuntime {
  readonly now: Clock;
  readonly newId: IdGenerator;
}

export const defaultRuntime: RepositoryRuntime = {
  now: systemClock,
  newId: uuidV7,
};
