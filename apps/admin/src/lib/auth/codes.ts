import "server-only";

import type { AdminAuthRepository } from "@portfolio/database";
import type { AdminCodePurpose, AdminUser } from "@portfolio/types";

import { createLoginCode, hashToken, timingSafeEqualString } from "./crypto.ts";

/**
 * The six digits, and the rules that make six digits enough.
 *
 * ## Length is not the control
 *
 * A six-digit code is one chance in a million. Against five attempts that is
 * excellent; against a million attempts it is nothing. The attempt cap is what
 * secures this, and the length only exists to make the cap comfortable — long
 * enough that five guesses are hopeless, short enough to be read off a phone
 * and typed without resentment.
 *
 * ## Three fences, not one
 *
 *   1. **Attempts per code** — enforced here. Five wrong answers and the code
 *      is burned, not merely rejected.
 *   2. **Codes per user per hour** — enforced by the caller through
 *      `CODE_REQUEST_RULE`, so burning a code cannot simply be repeated.
 *   3. **Submissions per user** — `CODE_ATTEMPT_RULE`, which catches the
 *      combination of the two: request, guess five times, request again.
 *
 * ## Short life
 *
 * Ten minutes. A code that outlives the sitting it was requested for is a
 * credential sitting in an inbox.
 */

/** How long a code is good for. */
export const CODE_TTL_MS = 10 * 60_000;

/** Wrong answers before the code is destroyed rather than merely refused. */
export const MAX_CODE_ATTEMPTS = 5;

export interface IssuedCode {
  /** The digits, to be emailed. Never stored, never logged, never returned. */
  readonly code: string;
}

/**
 * Creates a code for one purpose, replacing any live one for the same purpose.
 *
 * Replacement rather than accumulation: two valid codes are two chances to
 * guess, and a user who asks again has told you the first one is no use.
 */
export async function issueCode(
  repository: AdminAuthRepository,
  user: AdminUser,
  purpose: AdminCodePurpose,
  sessionId: string | null = null,
): Promise<IssuedCode> {
  const code = createLoginCode();
  await repository.createCode({
    userId: user.id,
    sessionId,
    purpose,
    codeHash: await hashToken(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return { code };
}

export type CodeCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "none" | "expired" | "wrong" | "exhausted";
      /** How many tries are left, when that is a meaningful thing to say. */
      readonly remaining?: number;
    };

/**
 * Checks a submitted code, counting the attempt whatever the answer.
 *
 * The attempt is recorded **before** the comparison. Recording it afterwards,
 * or only on failure, would let an attacker abandon a request mid-flight — or
 * simply race two — and guess without ever paying for it.
 *
 * A submitted value that is not six digits is still counted. Refusing it for
 * free would make the counter trivial to avoid.
 */
export async function verifyCode(
  repository: AdminAuthRepository,
  user: AdminUser,
  purpose: AdminCodePurpose,
  submitted: string,
): Promise<CodeCheck> {
  const record = await repository.getLiveCode(user.id, purpose);
  if (!record) return { ok: false, reason: "none" };

  if (Date.parse(record.expiresAt) <= Date.now()) {
    await repository.consumeCode(record.id);
    return { ok: false, reason: "expired" };
  }

  const attempts = await repository.recordCodeAttempt(record.id);
  if (attempts > MAX_CODE_ATTEMPTS) {
    // Burned, not just refused. A code that survives its attempt budget is a
    // code somebody can keep working on.
    await repository.consumeCode(record.id);
    return { ok: false, reason: "exhausted" };
  }

  const matches = timingSafeEqualString(
    await hashToken(submitted.trim()),
    record.codeHash,
  );

  if (!matches) {
    const remaining = MAX_CODE_ATTEMPTS - attempts;
    if (remaining <= 0) {
      await repository.consumeCode(record.id);
      return { ok: false, reason: "exhausted" };
    }
    return { ok: false, reason: "wrong", remaining };
  }

  // Single use. Without this, the code stays valid for the rest of its ten
  // minutes and a copy of the email is a second way in.
  await repository.consumeCode(record.id);
  return { ok: true };
}
