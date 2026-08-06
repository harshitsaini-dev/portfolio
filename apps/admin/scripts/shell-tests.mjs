/**
 * Admin foundation tests: the authorization guard's non-request paths,
 * identity presentation, and navigation integrity.
 *
 * The guard's Access branch reads request headers, which only exists inside
 * a Next.js request. But the branches that matter most for safety — "no
 * configuration at all" and "development identity" — never touch headers,
 * so they are directly testable here. The Access branch itself is covered
 * end to end by `auth-tests.mjs`.
 */

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

try {
  const { resolveAdminIdentity, requireAdminIdentity, AdminUnauthorizedError } =
    await import("../src/lib/auth/guard.ts");
  const { identityLabel, isProductionIdentity } = await import(
    "../src/lib/auth/identity.ts"
  );
  const { ADMIN_NAV, ADMIN_ROUTES } = await import("../src/lib/navigation.ts");

  // ---- Guard: fail-closed paths -----------------------------------------
  startGroup("Authorization guard");

  const nothing = await resolveAdminIdentity({ NODE_ENV: "production" });
  equal("an unconfigured production environment denies access", nothing.ok, false);
  equal("the denial reason is not_configured", nothing.reason, "not_configured");

  const prodWithOptIn = await resolveAdminIdentity({
    NODE_ENV: "production",
    ADMIN_DEV_AUTH: "enabled",
    ADMIN_DEV_EMAIL: "attacker@example.test",
  });
  equal(
    "a production build ignores the development opt-in entirely",
    prodWithOptIn.ok,
    false,
  );

  const devNoOptIn = await resolveAdminIdentity({ NODE_ENV: "development" });
  equal("development without the opt-in still denies access", devNoOptIn.ok, false);

  const dev = await resolveAdminIdentity({
    NODE_ENV: "development",
    ADMIN_DEV_AUTH: "enabled",
    ADMIN_DEV_EMAIL: "dev@example.test",
  });
  equal("development auth grants an identity when explicitly enabled", dev.ok, true);
  equal("the development identity is labelled as such", dev.identity?.source, "development");
  equal("the development email is used as a label", dev.identity?.email, "dev@example.test");
  check(
    "the development subject is a fixed non-credential value",
    dev.identity?.subject === "development-admin",
  );

  const devNoEmail = await resolveAdminIdentity({
    NODE_ENV: "development",
    ADMIN_DEV_AUTH: "enabled",
  });
  equal("a development identity without an email normalizes to null", devNoEmail.identity?.email, null);

  // ---- requireAdminIdentity ---------------------------------------------
  let thrown = null;
  try {
    await requireAdminIdentity({ NODE_ENV: "production" });
  } catch (error) {
    thrown = error;
  }
  check(
    "requireAdminIdentity throws AdminUnauthorizedError when denied",
    thrown instanceof AdminUnauthorizedError,
    thrown?.name,
  );
  check(
    "the thrown error message carries no internal detail",
    typeof thrown?.message === "string" &&
      !thrown.message.includes("CF_ACCESS") &&
      !thrown.message.includes("development auth is not enabled"),
    thrown?.message,
  );
  check(
    "the detail is non-enumerable, so it does not serialize into a response",
    !Object.keys(thrown ?? {}).includes("detail") &&
      !JSON.stringify(thrown ?? {}).includes("CF_ACCESS"),
    JSON.stringify(thrown ?? {}),
  );

  const granted = await requireAdminIdentity({
    NODE_ENV: "development",
    ADMIN_DEV_AUTH: "enabled",
  });
  equal("requireAdminIdentity returns the identity when granted", granted.source, "development");

  // ---- Guard: configured Access takes precedence -------------------------
  //
  // The injectable token reader lets the Access branch be exercised without
  // a Next.js request. Cryptographic verification itself is covered by
  // auth-tests.mjs; what matters here is the *branching*.
  startGroup("Guard precedence with Access configured");

  const configuredEnv = {
    NODE_ENV: "development",
    CF_ACCESS_TEAM_DOMAIN: "testteam.cloudflareaccess.com",
    CF_ACCESS_AUD: "aud-tag",
    // Present, and must be ignored entirely.
    ADMIN_DEV_AUTH: "enabled",
    ADMIN_DEV_EMAIL: "dev@example.test",
  };

  const forged = await resolveAdminIdentity(configuredEnv, async () => "forged.token.value");
  equal("a forged Access header is rejected", forged.ok, false);
  equal("the forged header fails verification", forged.reason, "invalid_token");
  check(
    "a failed Access check does NOT fall back to the development identity",
    forged.ok === false,
  );

  const noHeader = await resolveAdminIdentity(configuredEnv, async () => null);
  equal("a missing Access header is rejected when Access is configured", noHeader.ok, false);
  equal("the missing header reason is missing_token", noHeader.reason, "missing_token");
  check(
    "a missing header does NOT fall back to the development identity",
    noHeader.ok === false,
  );

  let readerCalled = false;
  await resolveAdminIdentity(
    { NODE_ENV: "development", ADMIN_DEV_AUTH: "enabled" },
    async () => {
      readerCalled = true;
      return null;
    },
  );
  check(
    "the request header is not read at all when Access is unconfigured",
    readerCalled === false,
  );

  // ---- Identity presentation --------------------------------------------
  startGroup("Identity presentation");

  equal(
    "an email is used as the display label when present",
    identityLabel({ subject: "abc", email: "a@example.test", source: "cloudflare-access" }),
    "a@example.test",
  );
  equal(
    "a long subject is truncated rather than dumped in full",
    identityLabel({
      subject: "0123456789abcdefghijklmnop",
      email: null,
      source: "cloudflare-access",
    }),
    "0123456789ab…",
  );
  equal(
    "a short subject is shown as-is",
    identityLabel({ subject: "short", email: null, source: "development" }),
    "short",
  );
  equal(
    "an Access identity is reported as production",
    isProductionIdentity({ subject: "a", email: null, source: "cloudflare-access" }),
    true,
  );
  equal(
    "a development identity is NOT reported as production",
    isProductionIdentity({ subject: "a", email: null, source: "development" }),
    false,
  );

  // ---- Protected layout must render per request -------------------------
  //
  // A source-text assertion rather than a runtime one: importing the layout
  // would pull in Client Components, which do not load outside a bundler.
  // Crude, but it guards a real and easily-lost security property — without
  // `force-dynamic` Next prerenders the layout and the authorization check
  // runs once at build time instead of per request. This regressed exactly
  // that way during development and was caught by the build output.
  startGroup("Protected layout rendering mode");

  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app");

  const protectedLayout = readFileSync(
    join(appDir, "(protected)", "layout.tsx"),
    "utf8",
  );
  check(
    "the protected layout forces per-request rendering",
    /export const dynamic\s*=\s*["']force-dynamic["']/.test(protectedLayout),
    "missing `export const dynamic = \"force-dynamic\"`",
  );
  check(
    "the protected layout resolves an identity before rendering the shell",
    protectedLayout.includes("resolveAdminIdentity"),
  );

  const rootLayout = readFileSync(join(appDir, "layout.tsx"), "utf8");
  check(
    "the root layout marks the admin app noindex",
    /index:\s*false/.test(rootLayout) && /follow:\s*false/.test(rootLayout),
  );

  // ---- The protected-page invariant --------------------------------------
  //
  // ARCHITECTURAL REGRESSION GUARD, NOT RUNTIME AUTH PROOF. It inspects
  // source text to enforce a convention; the runtime behaviour of that
  // convention is proven by auth-tests.mjs and by browser verification.
  //
  // What it enforces: every `page.tsx` under `(protected)/` must be exported
  // through `withAdminPage`, which awaits authorization before invoking the
  // page's render callback.
  //
  // Why it must exist: a layout redirect does not stop the child page from
  // rendering — React renders layout and children concurrently, so the
  // page's output lands in the RSC flight payload shipped with the redirect.
  // Measured in production: an unauthenticated `GET /` returned an 11.9 KB
  // body containing the dashboard's component tree. Phase 7 adds several
  // routes; forgetting the guard on one of them would silently reintroduce
  // that disclosure while the route still *looks* protected.
  startGroup("Protected-page invariant");

  const { readdirSync } = await import("node:fs");
  const protectedDir = join(appDir, "(protected)");

  /** Discovers page entry points at any depth, not just the root one. */
  const protectedPages = readdirSync(protectedDir, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? protectedDir, entry.name));

  /**
   * The approved pattern: the page's default export IS the wrapper call.
   *
   * Deliberately specific. A loose "does the file mention requireAdmin"
   * check would pass for a page that imports the guard and forgets to await
   * it, or calls it after building JSX — both of which still leak.
   *
   * Type arguments are matched by scanning for balanced angle brackets
   * rather than with a regex. A naive `<[^>]*>` breaks on nested generics
   * like `withAdminPage<{ params: Promise<{ id: string }> }>(…)` and would
   * report a correctly-guarded page as unguarded — which this check did,
   * before the scanner replaced it.
   */
  function usesApprovedWrapper(source) {
    const match = /export\s+default\s+withAdminPage\s*/.exec(source);
    if (!match) return false;

    let index = match.index + match[0].length;

    if (source[index] === "<") {
      let depth = 0;
      while (index < source.length) {
        const char = source[index];
        if (char === "<") depth += 1;
        else if (char === ">") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
        index += 1;
      }
      if (depth !== 0) return false;
    }

    // Only whitespace may sit between the wrapper (or its type arguments)
    // and the opening parenthesis of the call.
    while (index < source.length && /\s/.test(source[index])) index += 1;
    return source[index] === "(";
  }

  check(
    "at least one protected page was discovered",
    protectedPages.length > 0,
    `searched ${protectedDir}`,
  );

  for (const pagePath of protectedPages) {
    const source = readFileSync(pagePath, "utf8");
    const name = pagePath
      .slice(pagePath.indexOf("(protected)"))
      .replace(/\\/g, "/");
    check(
      `${name} is exported through withAdminPage`,
      usesApprovedWrapper(source),
      "a layout redirect alone still serializes this page's content into the unauthenticated response",
    );
    check(
      `${name} imports the wrapper from the auth module`,
      /from\s+["']@\/lib\/auth\/protected-page["']/.test(source),
    );
  }

  // Negative control: prove the policy actually rejects an unguarded page.
  // Applied to in-memory fixtures so no temporary route is ever added to the
  // real app — a stray unguarded page under (protected)/ would itself be the
  // vulnerability this test exists to prevent.
  const rejectedFixtures = [
    {
      label: "a plain default-exported async component",
      source:
        'export default async function ProjectsPage() {\n  return <div>Secret</div>;\n}\n',
    },
    {
      label: "a page that imports the guard but never awaits it",
      source:
        'import { requireAdminIdentityOrRedirect } from "@/lib/auth/guard";\n' +
        "export default async function P() {\n  return <div>Secret</div>;\n}\n",
    },
    {
      label: "a page that guards only after building its markup",
      source:
        'import { requireAdminIdentityOrRedirect } from "@/lib/auth/guard";\n' +
        "export default async function P() {\n" +
        "  const markup = <div>Secret</div>;\n" +
        "  await requireAdminIdentityOrRedirect();\n" +
        "  return markup;\n}\n",
    },
    {
      label: "a JSX boundary, which has the same RSC flaw",
      source:
        "export default function P() {\n  return <ProtectedBoundary><Secret /></ProtectedBoundary>;\n}\n",
    },
  ];

  for (const fixture of rejectedFixtures) {
    check(
      `the invariant REJECTS ${fixture.label}`,
      !usesApprovedWrapper(fixture.source),
    );
  }

  check(
    "the invariant ACCEPTS the approved wrapper form",
    usesApprovedWrapper(
      'import { withAdminPage } from "@/lib/auth/protected-page";\n' +
        "export default withAdminPage(async ({ identity }) => <div>{identity.email}</div>);\n",
    ),
  );
  check(
    "the invariant ACCEPTS the approved form with explicit type arguments",
    usesApprovedWrapper(
      "export default withAdminPage<{ params: Params }>(async () => null);\n",
    ),
  );

  check(
    "the denied page lives outside the protected group",
    (() => {
      try {
        readFileSync(join(appDir, "denied", "page.tsx"), "utf8");
        return true;
      } catch {
        return false;
      }
    })(),
  );

  // ---- Navigation integrity ---------------------------------------------
  startGroup("Navigation integrity");

  const allItems = ADMIN_NAV.flatMap((g) => g.items);
  check("navigation defines at least one group", ADMIN_NAV.length > 0);
  check("navigation defines items", allItems.length > 0);

  const linked = allItems.filter((item) => item.href);
  const unavailable = allItems.filter((item) => !item.href);

  // Every navigation href must correspond to a real route directory under
  // `(protected)/`, so a nav entry cannot outlive (or precede) its page.
  const servedRoutes = new Set(["/"]);
  for (const pagePath of protectedPages) {
    const relative = pagePath
      .slice(pagePath.indexOf("(protected)") + "(protected)".length)
      .replace(/\\/g, "/")
      .replace(/\/page\.\w+$/, "");
    // Skip dynamic segments — nav never links directly to `[id]` routes.
    if (relative.includes("[")) continue;
    servedRoutes.add(relative === "" ? "/" : relative);
  }

  check(
    "every linked item points at a route this app actually serves",
    linked.every((item) => item.href && servedRoutes.has(item.href)),
    `nav: ${linked.map((i) => i.href).join(", ")} | served: ${[...servedRoutes].join(", ")}`,
  );
  check(
    "every unavailable item explains when it arrives",
    unavailable.every(
      (item) => typeof item.availableIn === "string" && item.availableIn.length > 0,
    ),
  );
  check(
    "no item is both linked and marked unavailable",
    allItems.every((item) => !(item.href && item.availableIn)),
  );
  check(
    "no dead links: unavailable items carry no href",
    unavailable.every((item) => item.href === undefined),
  );
  check(
    "item labels are unique",
    new Set(allItems.map((i) => i.label)).size === allItems.length,
  );
  check(
    "ADMIN_ROUTES lists only real routes",
    ADMIN_ROUTES.every((route) => servedRoutes.has(route)),
    ADMIN_ROUTES.join(","),
  );
  check(
    "no navigation label contains an emoji",
    allItems.every((item) => !/\p{Extended_Pictographic}/u.test(item.label)),
  );
} catch (error) {
  console.error(`\nShell tests aborted: ${error?.stack ?? error}`);
  failures.push(`unexpected error: ${error?.message ?? error}`);
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Admin foundation tests passed.");
