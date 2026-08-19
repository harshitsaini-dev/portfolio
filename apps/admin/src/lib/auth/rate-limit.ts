import "server-only";

import type { AdminAuthRepository } from "@portfolio/database";

/**
 * The limits that stand between a login form and a password guesser.
 *
 * ## Why this is in the database
 *
 * Workers has a rate-limiting binding and it counts per data centre. An
 * attacker whose next request lands in a different colo would get a fresh
 * allowance, which is not a limit so much as a suggestion. D1 is one place, so
 * the count is one count.
 *
 * ## Why two keys per attempt
 *
 * Limiting by address alone lets one attacker work through a list of
 * passwords for the real account by rotating nothing at all. Limiting by IP
 * alone lets a botnet spread the same attack thinly enough to never trip it.
 * Both are checked, and either one tripping is enough to refuse.
 *
 * ## What a trip does
 *
 * Sets `blocked_until`, so the caller is refused for a fixed period rather
 * than being let back in the instant the window rolls over. The block is what
 * makes the limit expensive; the window only decides how quickly the counter
 * forgets.
 */

export interface RateLimitRule {
  /** How many attempts inside one window before the bucket trips. */
  readonly limit: number;
  /** Window length, milliseconds. */
  readonly windowMs: number;
  /** How long a tripped bucket stays refused, milliseconds. */
  readonly blockMs: number;
}

/**
 * Signing in with a password, per email address.
 *
 * Five attempts a quarter hour, then a quarter hour off. Generous enough that
 * the owner mistyping their own password twice never notices it, and slow
 * enough that guessing is measured in centuries.
 */
export const LOGIN_EMAIL_RULE: RateLimitRule = {
  limit: 5,
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
};

/**
 * The same, per client address.
 *
 * Looser, because a shared address is a real thing and a legitimate person
 * behind one should not be locked out by somebody else's typing. It exists to
 * catch the case the email rule cannot see: many addresses tried from one
 * place.
 */
export const LOGIN_IP_RULE: RateLimitRule = {
  limit: 20,
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
};

/**
 * Asking for a code to be emailed.
 *
 * Tight, and not really about guessing: an unlimited "send me a code" button
 * is a way to use somebody's inbox as a target. Three an hour is more than
 * anyone needs and far less than is worth automating.
 */
export const CODE_REQUEST_RULE: RateLimitRule = {
  limit: 3,
  windowMs: 60 * 60_000,
  blockMs: 30 * 60_000,
};

/**
 * Submitting a code.
 *
 * The per-code attempt counter is the real defence — see `verifyCode` — and
 * this is the second fence, catching somebody who keeps requesting fresh codes
 * to reset that counter.
 */
export const CODE_ATTEMPT_RULE: RateLimitRule = {
  limit: 10,
  windowMs: 30 * 60_000,
  blockMs: 30 * 60_000,
};

export type RateLimitOutcome =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Counts one attempt against a bucket and says whether it may proceed.
 *
 * Called **before** the work it protects, and it counts on every call
 * including the ones it refuses. A limiter that stops counting once it starts
 * refusing lets an attacker hammer through the block the moment it lifts.
 *
 * Not atomic. D1 has no compare-and-swap and this is a read followed by a
 * write, so two requests arriving in the same millisecond can both read the
 * same count and both write `n + 1`, losing one. That is a real hole and a
 * small one: it costs an attacker one extra attempt per exact collision, on a
 * limit of five, against a password they still have to guess. Closing it would
 * mean a Durable Object per bucket — a new runtime primitive, for that.
 */
export async function consumeRateLimit(
  repository: AdminAuthRepository,
  bucket: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitOutcome> {
  const state = await repository.getRateLimit(bucket);
  const nowMs = now.getTime();

  if (state?.blockedUntil) {
    const until = Date.parse(state.blockedUntil);
    if (Number.isFinite(until) && until > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((until - nowMs) / 1000),
      };
    }
  }

  const windowStart = state ? Date.parse(state.windowStartedAt) : Number.NaN;
  // A window that has run out — or a timestamp that will not parse, which
  // means a corrupt row and is treated as "start again" rather than trusted.
  const expired =
    !Number.isFinite(windowStart) || nowMs - windowStart >= rule.windowMs;

  const count = expired ? 1 : state!.count + 1;
  const startedAt = expired ? now.toISOString() : state!.windowStartedAt;

  if (count > rule.limit) {
    const blockedUntil = new Date(nowMs + rule.blockMs).toISOString();
    await repository.putRateLimit({
      bucket,
      count,
      windowStartedAt: startedAt,
      blockedUntil,
    });
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(rule.blockMs / 1000),
    };
  }

  await repository.putRateLimit({
    bucket,
    count,
    windowStartedAt: startedAt,
    blockedUntil: null,
  });
  return { allowed: true, remaining: rule.limit - count };
}

/**
 * Forgets a bucket, after the attempt it was guarding succeeded.
 *
 * Only ever called on success. Clearing it anywhere else would hand an
 * attacker a way to reset their own counter.
 */
export async function clearRateLimit(
  repository: AdminAuthRepository,
  bucket: string,
): Promise<void> {
  await repository.clearRateLimit(bucket);
}

/** Bucket keys. One function so a typo cannot silently create a new bucket. */
export const bucket = {
  loginEmail: (email: string) => `login:email:${email.trim().toLowerCase()}`,
  loginIp: (ip: string) => `login:ip:${ip}`,
  codeRequest: (userId: string) => `code:request:${userId}`,
  codeAttempt: (userId: string) => `code:attempt:${userId}`,
} as const;
