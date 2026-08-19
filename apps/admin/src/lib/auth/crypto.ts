import "server-only";

/**
 * The primitives the login is built from.
 *
 * ## Why WebCrypto and nothing else
 *
 * No dependency. Every algorithm here ships in the Workers runtime and in
 * Node, and a password-hashing library would be a third-party package sitting
 * directly on the credential path — the single worst place in this codebase to
 * add attack surface for convenience.
 *
 * ## Why PBKDF2 rather than argon2 or bcrypt
 *
 * Those are better algorithms. Neither is available: Workers has no native
 * module loading, so both would arrive as JavaScript or WebAssembly, run
 * slower per iteration than the runtime's own PBKDF2, and therefore be
 * configured *weaker* to fit inside the CPU budget of a request. PBKDF2-SHA256
 * at a high iteration count, run natively, is the stronger choice in this
 * environment even though it is the weaker algorithm on paper.
 *
 * ## Everything compared here is compared in constant time
 *
 * Password hashes, session ids and login codes. A comparison that returns
 * early on the first differing byte leaks, over enough samples, how much of a
 * guess was right — and the login code is only six digits, which is exactly
 * the size of secret that kind of leak can unravel.
 */

/**
 * PBKDF2 iterations for new passwords.
 *
 * OWASP's floor for PBKDF2-HMAC-SHA256 is 600,000 at the time of writing.
 * Stored per row rather than read from here at verification time, so raising
 * this number does not lock the owner out of their own site: an old password
 * keeps verifying at the count it was created with, and is rewritten at the
 * new count the next time it is used.
 */
export const PASSWORD_ITERATIONS = 600_000;

/** 16 bytes, the usual floor. Per user, never reused, never secret. */
const SALT_BYTES = 16;

/** 32 bytes out of PBKDF2 — the size of the SHA-256 it is built on. */
const DERIVED_BYTES = 32;

/** Session cookies. 32 bytes of randomness is 256 bits; nobody guesses that. */
const SESSION_TOKEN_BYTES = 32;

export interface PasswordHash {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    // `salt` is a Uint8Array; the cast is for the BufferSource type only.
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    DERIVED_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Hashes a password for storage. Never returns the password. */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, PASSWORD_ITERATIONS);
  return {
    hash: toBase64(derived),
    salt: toBase64(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed stored value: a corrupt
 * row must not become a way to crash the login into some other branch.
 */
export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  try {
    const derived = await derive(
      password,
      fromBase64(stored.salt),
      stored.iterations,
    );
    return timingSafeEqual(derived, fromBase64(stored.hash));
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same time as a real verification, and answers false.
 *
 * Used when the email does not match any user. Without it, "no such user"
 * returns in a millisecond and "wrong password" returns in the hundreds — a
 * difference visible from the outside, which turns the login form into a
 * checker for whether an address is the administrator's. The whole point of
 * a slow hash is that it is slow; that has to be true of the miss as well.
 */
export async function fakeVerify(password: string): Promise<false> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  await derive(password, salt, PASSWORD_ITERATIONS);
  return false;
}

/**
 * Compares two byte strings without leaking where they first differ.
 *
 * The length check ahead of the loop does leak the length, which is fine:
 * every value compared here has a fixed length, so there is nothing to learn.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

/** Compares two hex or base64 strings in constant time. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

/**
 * A new session token, for the cookie.
 *
 * base64url so it survives a cookie value without escaping. The database
 * stores only `hashToken` of this; the string returned here exists in exactly
 * two places, this function's caller and the owner's browser.
 */
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The stored form of a token or a code.
 *
 * A plain SHA-256, deliberately — not PBKDF2. These values are 256 bits of
 * randomness (or, for the code, short-lived and attempt-limited), so there is
 * no dictionary to stretch against, and a session lookup happens on every
 * single request. Making that lookup cost 600,000 iterations would be paying
 * for protection the value does not need.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * A six-digit login code, uniformly distributed.
 *
 * `% 1000000` over a random 32-bit integer would be biased — 2^32 is not a
 * multiple of a million, so the low codes would come up very slightly more
 * often. The bias is tiny and the fix is four lines, which is the wrong ratio
 * to argue about on a credential.
 */
export function createLoginCode(): string {
  const limit = 1_000_000;
  // The largest multiple of `limit` that fits in 32 bits. Draws above it are
  // discarded rather than folded in.
  const ceiling = Math.floor(0xffff_ffff / limit) * limit;
  const buffer = new Uint32Array(1);
  let draw = 0;
  do {
    crypto.getRandomValues(buffer);
    draw = buffer[0]!;
  } while (draw >= ceiling);
  return String(draw % limit).padStart(6, "0");
}
