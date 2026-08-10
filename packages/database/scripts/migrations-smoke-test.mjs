/**
 * D1 migration smoke test.
 *
 * Applies every migration in `migrations/` to a throwaway local D1 instance
 * and asserts the resulting schema is what we expect — tables, indexes,
 * referential integrity, and a representative sample of the constraints that
 * are supposed to reject bad data.
 *
 * This is the project's first real automated test. It exercises the actual
 * SQLite engine that backs D1 (workerd/miniflare), not a parser or a mock, so
 * a migration that is syntactically valid but semantically wrong still fails
 * here.
 *
 * Deliberately dependency-free: it drives the Wrangler CLI that the repo
 * already depends on, via `node:child_process` with argv arrays (no shell, so
 * no cross-platform quoting problems). Adding Vitest/Jest to run one file
 * would be a worse trade.
 *
 * Safety: LOCAL ONLY. `--local` plus an isolated `--persist-to` directory
 * mean it never touches the remote database, never needs Cloudflare
 * authentication, and is safe to run in CI. `--remote` must never appear in
 * this file.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// All paths derive from this file's own location via Node's path/URL APIs —
// never from `process.cwd()` and never with hardcoded separators. The script
// therefore behaves identically whether it is run by the workspace root
// `pnpm test`, by `pnpm --filter @portfolio/database test`, or directly.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const configPath = join(repoRoot, "wrangler.d1.jsonc");
const DATABASE = "portfolio-cms";

/**
 * Wrangler's JS entry point, invoked with the current Node binary.
 *
 * Deliberately not `pnpm exec wrangler`: on Windows that needs `shell: true`
 * to resolve the `.cmd` shim, and a shell re-splits arguments on whitespace,
 * which mangles every SQL string passed via `--command`. Spawning the JS
 * entry directly keeps `shell: false` and argv exact on all platforms.
 *
 * Resolved through Node's own module resolution and wrangler's declared
 * `bin` field rather than a hardcoded `node_modules/...` path, so it does
 * not depend on pnpm's hoisting layout or on wrangler's internal file
 * structure. No extra dependency is needed for this.
 */
function resolveWranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", {
    paths: [repoRoot],
  });
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const binField = manifest.bin;
  const relativeBin =
    typeof binField === "string" ? binField : binField?.wrangler;
  if (!relativeBin) {
    throw new Error("wrangler package.json declares no `wrangler` bin entry");
  }
  return resolve(dirname(manifestPath), relativeBin);
}

const wranglerBin = resolveWranglerBin();

/** Temporary D1 persistence directory. Created by us, removed by us. */
let persistDir = null;

const failures = [];
let checks = 0;

function check(description, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(description);
  }
}

function wrangler(args, { expectFailure = false } = {}) {
  const result = spawnSync(
    process.execPath,
    [
      wranglerBin,
      ...args,
      "--local",
      "-c",
      configPath,
      "--persist-to",
      persistDir,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      // No shell: argv must reach wrangler exactly as written, or SQL
      // strings get re-split on whitespace.
      shell: false,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );

  if (result.error) {
    throw new Error(`Failed to run wrangler: ${result.error.message}`);
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 && !expectFailure) {
    throw new Error(`wrangler ${args.join(" ")} exited ${result.status}\n${output}`);
  }
  return { status: result.status, output };
}

/** Run SQL and return the first statement's rows. */
function query(sql) {
  const { output } = wrangler(["d1", "execute", DATABASE, "--json", "--command", sql]);
  // Wrangler prints a banner before the JSON payload; take from the first
  // top-level bracket onwards.
  const start = output.indexOf("[");
  if (start === -1) {
    throw new Error(`No JSON in wrangler output:\n${output}`);
  }
  const parsed = JSON.parse(output.slice(start));
  return parsed[0]?.results ?? [];
}

/**
 * Assert that a statement is REJECTED by the database. Used to prove
 * constraints actually bite rather than merely being present in the DDL.
 */
function expectRejected(description, sql) {
  const { status, output } = wrangler(
    ["d1", "execute", DATABASE, "--command", sql],
    { expectFailure: true },
  );
  check(description, status !== 0, status === 0 ? "statement was accepted" : "");
  return output;
}

function cleanup() {
  if (persistDir && existsSync(persistDir)) {
    rmSync(persistDir, { recursive: true, force: true });
    console.log(`\nRemoved temporary D1 state: ${persistDir}`);
  }
}

// ---------------------------------------------------------------------------

const EXPECTED_TABLES = [
  "certifications",
  "contact_messages",
  "education",
  "headline_alternates",
  "media_assets",
  "profile",
  "project_links",
  "project_media",
  "project_technologies",
  "projects",
  "resumes",
  "robot_lines",
  "scene_settings",
  "section_alternates",
  "sections",
  "site_settings",
  "skill_categories",
  "skills",
  "social_links",
  "technologies",
  "terminal_lines",
  // 0011 — aggregated page-view counts, written by the public site.
  "page_view_daily",
  // 0012 — written posts.
  "notes",
  "referrer_daily",
  "timeline_entries",
  "timeline_highlights",
  "tools",
];

const EXPECTED_INDEXES = [
  "idx_certifications_visible_position",
  "idx_headline_alternates_visible_position",
  "idx_contact_messages_status_created",
  "idx_education_visible_position",
  "idx_project_links_project_position",
  "idx_project_media_asset",
  "idx_project_media_project_position",
  "idx_project_technologies_technology",
  "idx_projects_cover_media",
  "idx_projects_status_position",
  "idx_resumes_media_asset",
  "idx_resumes_single_current",
  "idx_section_alternates_section_field_position",
  "idx_sections_visible_position",
  "idx_terminal_lines_visible_position",
  "idx_page_view_daily_day",
  "idx_notes_status_published",
  "idx_referrer_daily_day",
  "idx_site_settings_social_image",
  "idx_skill_categories_visible_position",
  "idx_skills_category_position",
  "idx_social_links_visible_position",
  "idx_timeline_entries_started_on",
  "idx_timeline_entries_visible_position",
  "idx_timeline_highlights_entry_position",
  "idx_tools_visible_position",
];

try {
  persistDir = mkdtempSync(join(tmpdir(), "portfolio-d1-smoke-"));
  console.log(`D1 migration smoke test`);
  console.log(`Temporary D1 state: ${persistDir}\n`);

  // -- 1. Clean state has migrations pending --------------------------------
  console.log("Migrations");
  const listBefore = wrangler(["d1", "migrations", "list", DATABASE]).output;
  check(
    "clean state reports the initial migration as unapplied",
    listBefore.includes("0001_initial_schema.sql"),
  );

  // -- 2. Apply from clean --------------------------------------------------
  const apply = wrangler(["d1", "migrations", "apply", DATABASE]);
  check("migrations apply successfully from a clean state", apply.status === 0);

  // -- 3. Re-applying is a no-op -------------------------------------------
  const reapply = wrangler(["d1", "migrations", "apply", DATABASE]);
  check(
    "re-applying leaves no unapplied migrations (idempotent at the runner level)",
    reapply.output.includes("No migrations to apply"),
  );

  // -- 4. Tables ------------------------------------------------------------
  console.log("\nSchema objects");
  // Excludes tables the platform owns rather than the migrations:
  //   sqlite_*      SQLite internals
  //   d1_migrations Wrangler's applied-migration ledger
  //   _cf_*         Cloudflare/miniflare internals (e.g. _cf_METADATA)
  const tables = query(
    "SELECT name FROM sqlite_master WHERE type = 'table' " +
      "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' " +
      "AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name;",
  ).map((row) => row.name);

  for (const table of EXPECTED_TABLES) {
    check(`table \`${table}\` exists`, tables.includes(table));
  }
  const unexpected = tables.filter((t) => !EXPECTED_TABLES.includes(t));
  check(
    "no unexpected tables were created",
    unexpected.length === 0,
    unexpected.join(", "),
  );

  // -- 5. Indexes -----------------------------------------------------------
  const indexes = query(
    "SELECT name FROM sqlite_master WHERE type = 'index' " +
      "AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  ).map((row) => row.name);

  for (const index of EXPECTED_INDEXES) {
    check(`index \`${index}\` exists`, indexes.includes(index));
  }

  // -- 6. Referential integrity --------------------------------------------
  console.log("\nReferential integrity");
  const fkViolations = query("PRAGMA foreign_key_check;");
  check(
    "PRAGMA foreign_key_check reports no violations",
    fkViolations.length === 0,
    JSON.stringify(fkViolations),
  );

  const fkTargets = query("PRAGMA foreign_key_list(projects);");
  check(
    "projects.cover_media_id references media_assets",
    fkTargets.some((fk) => fk.table === "media_assets"),
  );

  // -- 7. Constraints actually reject bad data ------------------------------
  console.log("\nConstraint enforcement");

  expectRejected(
    "CHECK rejects a boolean column set to a non-0/1 value",
    "INSERT INTO tools (id, name, is_visible) VALUES ('t-bad', 'Bad', 7);",
  );

  expectRejected(
    "CHECK rejects a negative sort position",
    "INSERT INTO tools (id, name, position) VALUES ('t-neg', 'Neg', -1);",
  );

  expectRejected(
    "CHECK rejects an invalid enumerated status",
    "INSERT INTO projects (id, slug, title, summary, status) " +
      "VALUES ('p-bad', 'bad', 'Bad', 'Bad', 'nonsense');",
  );

  // Singleton-key tables: the guarantee is AT MOST one row, not that a row
  // exists. Both halves of that guarantee are asserted below; nothing here
  // claims a row is always present.
  expectRejected(
    "CHECK rejects a non-singleton id on profile",
    "INSERT INTO profile (id, full_name, headline) " +
      "VALUES ('not-singleton', 'X', 'Y');",
  );

  wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "INSERT INTO profile (id, full_name, headline) " +
      "VALUES ('singleton', 'Placeholder', 'Placeholder headline');",
  ]);
  expectRejected(
    "PRIMARY KEY allows at most one profile row",
    "INSERT INTO profile (id, full_name, headline) " +
      "VALUES ('singleton', 'Second', 'Should be rejected');",
  );

  // The schema permits zero rows in a singleton-key table — deleting the
  // only row must succeed, since existence is a Phase 5 bootstrap concern
  // rather than a database invariant.
  const deletedSingleton = wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "DELETE FROM profile WHERE id = 'singleton';",
  ]);
  check(
    "singleton-key table permits zero rows (existence is not enforced)",
    deletedSingleton.status === 0,
  );

  expectRejected(
    "FOREIGN KEY rejects a child row with no parent",
    "INSERT INTO project_links (id, project_id, label, url) " +
      "VALUES ('pl-orphan', 'no-such-project', 'Repo', 'https://example.test');",
  );

  // UNIQUE slug — seed a valid row first, then attempt a duplicate.
  wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "INSERT INTO projects (id, slug, title, summary) " +
      "VALUES ('p-1', 'unique-slug', 'One', 'Summary');",
  ]);
  expectRejected(
    "UNIQUE rejects a duplicate project slug",
    "INSERT INTO projects (id, slug, title, summary) " +
      "VALUES ('p-2', 'unique-slug', 'Two', 'Summary');",
  );

  // Composite PK on the join table rejects a duplicate pair.
  wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "INSERT INTO technologies (id, name, slug) VALUES ('tech-1', 'TypeScript', 'typescript');" +
      "INSERT INTO project_technologies (project_id, technology_id) VALUES ('p-1', 'tech-1');",
  ]);
  expectRejected(
    "composite PRIMARY KEY rejects a duplicate project/technology pair",
    "INSERT INTO project_technologies (project_id, technology_id) VALUES ('p-1', 'tech-1');",
  );

  expectRejected(
    "ON DELETE RESTRICT blocks deleting a technology still in use",
    "DELETE FROM technologies WHERE id = 'tech-1';",
  );

  // Partial unique index: at most one current résumé.
  wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "INSERT INTO media_assets (id, storage_key, content_type, byte_size) " +
      "VALUES ('m-1', 'resumes/a.pdf', 'application/pdf', 1024);" +
      "INSERT INTO media_assets (id, storage_key, content_type, byte_size) " +
      "VALUES ('m-2', 'resumes/b.pdf', 'application/pdf', 2048);" +
      "INSERT INTO resumes (id, label, media_asset_id, is_current) " +
      "VALUES ('r-1', 'CV 2026', 'm-1', 1);",
  ]);
  expectRejected(
    "partial UNIQUE index allows only one current résumé",
    "INSERT INTO resumes (id, label, media_asset_id, is_current) " +
      "VALUES ('r-2', 'CV old', 'm-2', 1);",
  );

  // -- 8. ON DELETE CASCADE actually cascades -------------------------------
  console.log("\nDelete behaviour");
  wrangler([
    "d1",
    "execute",
    DATABASE,
    "--command",
    "INSERT INTO projects (id, slug, title, summary) " +
      "VALUES ('p-cascade', 'cascade-me', 'Cascade', 'Summary');" +
      "INSERT INTO project_links (id, project_id, label, url) " +
      "VALUES ('pl-1', 'p-cascade', 'Repo', 'https://example.test');" +
      "DELETE FROM projects WHERE id = 'p-cascade';",
  ]);
  const orphanLinks = query(
    "SELECT COUNT(*) AS n FROM project_links WHERE project_id = 'p-cascade';",
  );
  check(
    "ON DELETE CASCADE removes a project's links with the project",
    Number(orphanLinks[0]?.n) === 0,
    JSON.stringify(orphanLinks),
  );

  // -- 9. Integrity still clean after all of the above ---------------------
  const finalFkCheck = query("PRAGMA foreign_key_check;");
  check(
    "PRAGMA foreign_key_check still clean after constraint exercises",
    finalFkCheck.length === 0,
    JSON.stringify(finalFkCheck),
  );
} catch (error) {
  console.error(`\nSmoke test aborted: ${error.message}`);
  failures.push(`unexpected error: ${error.message}`);
} finally {
  cleanup();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILED:`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("D1 migration smoke test passed.");
