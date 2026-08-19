/**
 * Tests for the login's primitives and its refusal paths.
 *
 * What is covered here is the part that must never quietly regress: the
 * password hashing, the constant-time comparisons, the code generator, the
 * attempt cap and the rate limiter. All of it is pure logic over an injected
 * repository, so it runs in plain Node with no Next.js, no D1 and no network.
 *
 * What is *not* covered here is the Server Actions, which need a request to
 * exist before they can be called at all. Those were exercised in a browser
 * against a real local database — see `docs/PROJECT_STATE.md` for the
 * measurements — and the pieces they are built from are what this file pins.
 *
 * The stakes are the reason for the detail. Everything else in this app can be
 * wrong and produce a bad page; this can be wrong and produce an open door.
 */

import { registerHooks } from "node:module";

/** The app's `@/*` alias, which Next resolves and plain Node does not. */
const srcRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    // `server-only` is a build-time marker with no Node resolution. Swapped
    // for an empty module so the modules under test can be imported at all.
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const crypto = await import("../src/lib/auth/crypto.ts");
const codes = await import("../src/lib/auth/codes.ts");
const rateLimit = await import("../src/lib/auth/rate-limit.ts");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------
console.log("\nPasswords");
{
  const hashed = await crypto.hashPassword("correct horse battery staple");

  check("a hash is not the password", hashed.hash !== "correct horse battery staple");
  check("a salt is generated", hashed.salt.length > 0);
  check("the iteration count is stored", hashed.iterations === crypto.PASSWORD_ITERATIONS);

  const again = await crypto.hashPassword("correct horse battery staple");
  check(
    "the same password hashes differently each time (the salt is not fixed)",
    again.hash !== hashed.hash,
  );

  check(
    "the right password verifies",
    await crypto.verifyPassword("correct horse battery staple", hashed),
  );
  check(
    "a wrong password does not",
    !(await crypto.verifyPassword("correct horse battery stapl", hashed)),
  );
  check(
    "the empty password does not",
    !(await crypto.verifyPassword("", hashed)),
  );
  check(
    "a corrupt stored hash refuses rather than throwing",
    !(await crypto.verifyPassword("anything", {
      hash: "not base64 at all !!!",
      salt: "also not",
      iterations: 1000,
    })),
  );

  // The miss has to cost what a hit costs, or the response time answers the
  // question "is this address the administrator's".
  const realStart = performance.now();
  await crypto.verifyPassword("wrong", hashed);
  const realCost = performance.now() - realStart;

  const fakeStart = performance.now();
  await crypto.fakeVerify("wrong");
  const fakeCost = performance.now() - fakeStart;

  const ratio = fakeCost / realCost;
  check(
    `a missing user costs about the same as a wrong password (ratio ${ratio.toFixed(2)})`,
    ratio > 0.5 && ratio < 2,
  );
  check("fakeVerify always answers false", (await crypto.fakeVerify("x")) === false);
}

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------
console.log("\nComparison");
{
  const a = new Uint8Array([1, 2, 3, 4]);
  check("equal arrays compare equal", crypto.timingSafeEqual(a, new Uint8Array([1, 2, 3, 4])));
  check("a differing last byte is unequal", !crypto.timingSafeEqual(a, new Uint8Array([1, 2, 3, 5])));
  check("a differing first byte is unequal", !crypto.timingSafeEqual(a, new Uint8Array([9, 2, 3, 4])));
  check("different lengths are unequal", !crypto.timingSafeEqual(a, new Uint8Array([1, 2, 3])));
  check("strings compare too", crypto.timingSafeEqualString("abc", "abc"));
  check("differing strings do not", !crypto.timingSafeEqualString("abc", "abd"));
}

// ---------------------------------------------------------------------------
// Tokens and codes
// ---------------------------------------------------------------------------
console.log("\nTokens and codes");
{
  const tokens = new Set();
  for (let i = 0; i < 500; i += 1) tokens.add(crypto.createSessionToken());
  check("500 session tokens are 500 different tokens", tokens.size === 500);
  check(
    "a token is URL-safe",
    [...tokens].every((token) => /^[A-Za-z0-9_-]+$/.test(token)),
  );

  const sample = crypto.createSessionToken();
  const hashed = await crypto.hashToken(sample);
  check("a token hash is 64 hex characters (SHA-256)", /^[0-9a-f]{64}$/.test(hashed));
  check("hashing is stable", (await crypto.hashToken(sample)) === hashed);
  check(
    "a different token hashes differently",
    (await crypto.hashToken(crypto.createSessionToken())) !== hashed,
  );

  const drawn = [];
  for (let i = 0; i < 2000; i += 1) drawn.push(crypto.createLoginCode());
  check("every code is exactly six digits", drawn.every((c) => /^\d{6}$/.test(c)));
  check("codes vary", new Set(drawn).size > 1900);
  // A biased generator would skew low, because 2^32 is not a multiple of a
  // million. Not a proof of uniformity — a smoke test that the rejection
  // sampling is doing something.
  const low = drawn.filter((c) => Number(c) < 500_000).length;
  check(
    `the halves are about even (${low}/2000 below 500000)`,
    low > 850 && low < 1150,
  );
}

// ---------------------------------------------------------------------------
// The attempt cap
// ---------------------------------------------------------------------------
console.log("\nThe attempt cap");
{
  /** The smallest repository the code path needs, with a real clock. */
  function fakeAuth(initial) {
    const state = { ...initial };
    return {
      state,
      async getLiveCode() {
        return state.code;
      },
      async recordCodeAttempt() {
        state.code = { ...state.code, attempts: state.code.attempts + 1 };
        return state.code.attempts;
      },
      async consumeCode() {
        state.consumed = true;
        state.code = { ...state.code, consumedAt: new Date().toISOString() };
      },
    };
  }

  const user = { id: "u1" };
  const correct = "123456";
  const codeHash = await crypto.hashToken(correct);
  const future = new Date(Date.now() + 60_000).toISOString();

  {
    const auth = fakeAuth({
      code: { id: "c1", codeHash, expiresAt: future, attempts: 0 },
    });
    const result = await codes.verifyCode(auth, user, "login", correct);
    check("the right code is accepted", result.ok);
    check("and is consumed, so it cannot be reused", auth.state.consumed === true);
  }

  {
    const auth = fakeAuth({
      code: { id: "c1", codeHash, expiresAt: future, attempts: 0 },
    });
    const result = await codes.verifyCode(auth, user, "login", "000000");
    check("a wrong code is refused", !result.ok && result.reason === "wrong");
    check(
      `and reports the attempts left (${result.remaining})`,
      result.remaining === codes.MAX_CODE_ATTEMPTS - 1,
    );
    check("a wrong code costs an attempt", auth.state.code.attempts === 1);
  }

  {
    const auth = fakeAuth({
      code: {
        id: "c1",
        codeHash,
        expiresAt: future,
        attempts: codes.MAX_CODE_ATTEMPTS,
      },
    });
    const result = await codes.verifyCode(auth, user, "login", correct);
    check(
      "past the cap even the RIGHT code is refused",
      !result.ok && result.reason === "exhausted",
    );
    check("and the code is destroyed rather than left usable", auth.state.consumed === true);
  }

  {
    const auth = fakeAuth({
      code: {
        id: "c1",
        codeHash,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        attempts: 0,
      },
    });
    const result = await codes.verifyCode(auth, user, "login", correct);
    check("an expired code is refused", !result.ok && result.reason === "expired");
    check("and consumed, so it cannot be raced", auth.state.consumed === true);
  }

  {
    const auth = { async getLiveCode() { return null; } };
    const result = await codes.verifyCode(auth, user, "login", correct);
    check("no code at all is refused", !result.ok && result.reason === "none");
  }

  {
    // A submission that is not even six digits still costs an attempt.
    const auth = fakeAuth({
      code: { id: "c1", codeHash, expiresAt: future, attempts: 0 },
    });
    await codes.verifyCode(auth, user, "login", "nonsense");
    check("a malformed submission is still counted", auth.state.code.attempts === 1);
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
console.log("\nRate limiting");
{
  function fakeLimiter() {
    const rows = new Map();
    return {
      rows,
      async getRateLimit(bucket) {
        return rows.get(bucket) ?? null;
      },
      async putRateLimit(state) {
        rows.set(state.bucket, state);
      },
      async clearRateLimit(bucket) {
        rows.delete(bucket);
      },
    };
  }

  const rule = { limit: 3, windowMs: 60_000, blockMs: 300_000 };

  {
    const auth = fakeLimiter();
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await rateLimit.consumeRateLimit(auth, "b", rule));
    }
    check("the first three are allowed", results.slice(0, 3).every((r) => r.allowed));
    check("the fourth is refused", !results[3].allowed);
    check("the fifth is still refused", !results[4].allowed);
    check(
      "and it says how long to wait",
      !results[3].allowed && results[3].retryAfterSeconds === 300,
    );
    // Deliberately *not* counted once blocked — see `consumeRateLimit` for
    // why extending a block on every attempt would let an attacker lock the
    // owner out of their own CMS with traffic alone. The count stops at the
    // attempt that tripped it.
    check(
      "a blocked bucket refuses without counting further",
      auth.rows.get("b").count === 4,
    );
  }

  {
    // The window rolls over; the block does not.
    const auth = fakeLimiter();
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 3; i += 1) {
      await rateLimit.consumeRateLimit(auth, "b", rule, now);
    }
    const later = new Date(now.getTime() + 61_000);
    const after = await rateLimit.consumeRateLimit(auth, "b", rule, later);
    check("a fresh window starts a fresh count", after.allowed);
    check("and the count restarted at one", auth.rows.get("b").count === 1);
  }

  {
    const auth = fakeLimiter();
    const now = new Date("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 4; i += 1) {
      await rateLimit.consumeRateLimit(auth, "b", rule, now);
    }
    // Inside the block, even after the window would have rolled over.
    const during = new Date(now.getTime() + 120_000);
    const refused = await rateLimit.consumeRateLimit(auth, "b", rule, during);
    check("a block outlives its window", !refused.allowed);

    const afterBlock = new Date(now.getTime() + 400_000);
    const allowed = await rateLimit.consumeRateLimit(auth, "b", rule, afterBlock);
    check("and lifts when it expires", allowed.allowed);
  }

  {
    const auth = fakeLimiter();
    await rateLimit.consumeRateLimit(auth, "b", rule);
    await rateLimit.clearRateLimit(auth, "b");
    check("a successful attempt can clear its bucket", auth.rows.has("b") === false);
  }

  {
    // A corrupt timestamp must fail towards "start again", not towards
    // "allow forever" or a thrown error on the login path.
    const auth = fakeLimiter();
    auth.rows.set("b", {
      bucket: "b",
      count: 99,
      windowStartedAt: "not a date",
      blockedUntil: null,
    });
    const result = await rateLimit.consumeRateLimit(auth, "b", rule);
    check("an unparseable window is treated as expired", result.allowed);
    check("and the count restarts rather than being trusted", auth.rows.get("b").count === 1);
  }

  {
    check(
      "bucket keys are distinct per kind",
      new Set([
        rateLimit.bucket.loginEmail("a@b.com"),
        rateLimit.bucket.loginIp("a@b.com"),
        rateLimit.bucket.codeRequest("a@b.com"),
        rateLimit.bucket.codeAttempt("a@b.com"),
      ]).size === 4,
    );
    check(
      "an email bucket is case-insensitive",
      rateLimit.bucket.loginEmail("A@B.com") === rateLimit.bucket.loginEmail("a@b.com"),
    );
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.log(`${failed} FAILED:`);
  process.exit(1);
}
console.log("Login tests passed.");
