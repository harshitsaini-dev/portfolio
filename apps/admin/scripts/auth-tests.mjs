/**
 * Admin authentication boundary tests.
 *
 * These are the tests that matter most in the whole repository: everything
 * else protects data quality, this protects the CMS itself.
 *
 * Approach: generate a throwaway RSA key pair locally with `jose`, sign
 * tokens with it, and hand the public key to the verifier through its
 * `keyResolver` seam. That means **no network, no Cloudflare account, no
 * real Access token, and no secrets** — and every failure mode (bad
 * signature, wrong audience, wrong issuer, expiry) can be produced on
 * demand, which is impossible with a real token.
 *
 * Run with `node --experimental-strip-types` via the package `test` script;
 * the modules under test are the real TypeScript sources.
 */

import { generateKeyPair, SignJWT, exportJWK, importJWK } from "jose";

const failures = [];
let checks = 0;
let group = "";

function startGroup(name) {
  group = name;
  console.log(`\n${name}`);
}

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`[${group}] ${description}`);
  }
}

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const TEAM_DOMAIN = "testteam.cloudflareaccess.com";
const ISSUER = `https://${TEAM_DOMAIN}`;
const AUDIENCE = "test-audience-tag";

/** Environment representing a correctly configured production deployment. */
const configuredEnv = {
  NODE_ENV: "production",
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUD: AUDIENCE,
};

try {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  // A second, unrelated key: signing with it produces a structurally valid
  // token with a signature our verifier must reject.
  const attacker = await generateKeyPair("RS256", { extractable: true });

  const publicJwk = await exportJWK(publicKey);
  const keyResolver = await importJWK(publicJwk, "RS256");

  async function mint(overrides = {}, signingKey = privateKey) {
    const {
      issuer = ISSUER,
      audience = AUDIENCE,
      subject = "user-abc-123",
      email = "admin@example.test",
      expiresIn = "5m",
      issuedAt = Math.floor(Date.now() / 1000),
      omitSubject = false,
    } = overrides;

    let jwt = new SignJWT(email ? { email } : {})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(issuedAt)
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expiresIn);

    if (!omitSubject) jwt = jwt.setSubject(subject);
    return jwt.sign(signingKey);
  }

  const { verifyAccessToken } = await import("../src/lib/auth/verify.ts");
  const { readAccessConfig, isDevelopmentAuthEnabled } = await import(
    "../src/lib/auth/config.ts"
  );

  // ---- Configuration -----------------------------------------------------
  startGroup("Access configuration");

  check(
    "missing team domain is reported, not defaulted",
    readAccessConfig({ CF_ACCESS_AUD: AUDIENCE }).ok === false,
  );
  check(
    "missing audience is reported, not defaulted",
    readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN }).ok === false,
  );
  check("fully configured environment is accepted", readAccessConfig(configuredEnv).ok);

  const unconfigured = await verifyAccessToken(await mint(), {
    keyResolver,
    env: { NODE_ENV: "production" },
  });
  equal(
    "a valid token is REJECTED when Access is not configured (fail closed)",
    unconfigured.ok,
    false,
  );
  equal("rejection reason is not_configured", unconfigured.reason, "not_configured");

  // ---- Development auth cannot activate in production --------------------
  startGroup("Development auth guard");

  equal(
    "development auth is off by default in development",
    isDevelopmentAuthEnabled({ NODE_ENV: "development" }),
    false,
  );
  equal(
    "development auth activates in development with the explicit opt-in",
    isDevelopmentAuthEnabled({ NODE_ENV: "development", ADMIN_DEV_AUTH: "enabled" }),
    true,
  );
  equal(
    "the opt-in ALONE cannot enable it in production",
    isDevelopmentAuthEnabled({ NODE_ENV: "production", ADMIN_DEV_AUTH: "enabled" }),
    false,
  );
  equal(
    "no combination of env vars enables it in production",
    isDevelopmentAuthEnabled({
      NODE_ENV: "production",
      ADMIN_DEV_AUTH: "enabled",
      ADMIN_DEV_EMAIL: "attacker@example.test",
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD: AUDIENCE,
    }),
    false,
  );
  equal(
    "configured Access disables the development path even in development",
    isDevelopmentAuthEnabled({
      NODE_ENV: "development",
      ADMIN_DEV_AUTH: "enabled",
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD: AUDIENCE,
    }),
    false,
  );
  equal(
    "a near-miss opt-in value does not count",
    isDevelopmentAuthEnabled({ NODE_ENV: "development", ADMIN_DEV_AUTH: "true" }),
    false,
  );

  // ---- Valid token -------------------------------------------------------
  startGroup("Access JWT verification");

  const valid = await verifyAccessToken(await mint(), {
    keyResolver,
    env: configuredEnv,
  });
  equal("a valid token is accepted", valid.ok, true);
  equal("subject is normalized onto the identity", valid.identity?.subject, "user-abc-123");
  equal("email is normalized onto the identity", valid.identity?.email, "admin@example.test");
  equal(
    "source is recorded as cloudflare-access",
    valid.identity?.source,
    "cloudflare-access",
  );

  // ---- Rejection cases ---------------------------------------------------
  const cases = [
    {
      label: "missing token",
      token: null,
      expectedReason: "missing_token",
    },
    {
      label: "empty token",
      token: "   ",
      expectedReason: "missing_token",
    },
    {
      label: "malformed token",
      token: "not-a-jwt",
      expectedReason: "invalid_token",
    },
    {
      label: "token with tampered payload",
      token: await mint().then((t) => {
        const [header, , signature] = t.split(".");
        const forged = Buffer.from(
          JSON.stringify({
            sub: "attacker",
            iss: ISSUER,
            aud: AUDIENCE,
            exp: Math.floor(Date.now() / 1000) + 300,
          }),
        ).toString("base64url");
        return `${header}.${forged}.${signature}`;
      }),
      expectedReason: "invalid_token",
    },
    {
      label: "token signed by a different key",
      token: await mint({}, attacker.privateKey),
      expectedReason: "invalid_token",
    },
    {
      label: "expired token",
      token: await mint({
        expiresIn: Math.floor(Date.now() / 1000) - 60,
        issuedAt: Math.floor(Date.now() / 1000) - 600,
      }),
      expectedReason: "invalid_token",
    },
    {
      label: "wrong audience",
      token: await mint({ audience: "some-other-application" }),
      expectedReason: "invalid_token",
    },
    {
      label: "wrong issuer",
      token: await mint({ issuer: "https://evil.cloudflareaccess.com" }),
      expectedReason: "invalid_token",
    },
    {
      label: "token with no subject",
      token: await mint({ omitSubject: true }),
      expectedReason: "invalid_token",
    },
  ];

  for (const testCase of cases) {
    const result = await verifyAccessToken(testCase.token, {
      keyResolver,
      env: configuredEnv,
    });
    equal(`${testCase.label} is rejected`, result.ok, false);
    equal(`${testCase.label} → ${testCase.expectedReason}`, result.reason, testCase.expectedReason);
  }

  // An unsigned token must never be accepted: the classic `alg: none` bypass.
  const unsecured = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(
    JSON.stringify({
      sub: "attacker",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString("base64url")}.`;
  const unsecuredResult = await verifyAccessToken(unsecured, {
    keyResolver,
    env: configuredEnv,
  });
  equal("an `alg: none` unsecured token is rejected", unsecuredResult.ok, false);

  // A token signed with HS256 using the public key as an HMAC secret — the
  // classic algorithm-confusion attack. Pinning `algorithms: ["RS256"]`
  // stops it.
  const { SignJWT: HsSign } = await import("jose");
  const hmacToken = await new HsSign({ email: "attacker@example.test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("attacker")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));
  const hmacResult = await verifyAccessToken(hmacToken, {
    keyResolver,
    env: configuredEnv,
  });
  equal("an HS256 algorithm-confusion token is rejected", hmacResult.ok, false);

  // ---- Identity normalization -------------------------------------------
  startGroup("Identity normalization");

  const rich = await new SignJWT({
    email: "admin@example.test",
    // Claims that must NOT reach the UI.
    country: "GB",
    custom: "sensitive-value",
    identity_nonce: "abc123",
    type: "app",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-xyz")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const normalized = await verifyAccessToken(rich, {
    keyResolver,
    env: configuredEnv,
  });
  check("rich token verifies", normalized.ok === true);
  const identityKeys = Object.keys(normalized.identity ?? {}).sort();
  equal(
    "identity exposes exactly subject, email, source",
    identityKeys.join(","),
    "email,source,subject",
  );

  const serialized = JSON.stringify(normalized.identity);
  check(
    "extra claims are not present on the identity",
    !serialized.includes("sensitive-value") &&
      !serialized.includes("identity_nonce") &&
      !serialized.includes("abc123"),
    serialized,
  );
  check(
    "the raw token is not returned to callers",
    !serialized.includes(rich.slice(0, 24)),
  );

  const missingEmail = await verifyAccessToken(
    await mint({ email: null }),
    { keyResolver, env: configuredEnv },
  );
  equal("absent email normalizes to null, not undefined", missingEmail.identity?.email, null);

  // ---- Failure detail is not leaked to the UI shape ----------------------
  startGroup("Error surface");

  const rejected = await verifyAccessToken(await mint({ audience: "wrong" }), {
    keyResolver,
    env: configuredEnv,
  });
  check(
    "failures carry a coarse reason, not a token",
    typeof rejected.reason === "string" && !JSON.stringify(rejected).includes("eyJ"),
    JSON.stringify(rejected),
  );
  check(
    "failure results carry no identity",
    rejected.identity === undefined,
  );
} catch (error) {
  console.error(`\nAuth tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Admin authentication tests passed.");
