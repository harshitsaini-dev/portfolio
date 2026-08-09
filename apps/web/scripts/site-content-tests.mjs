/**
 * Public site content tests.
 *
 * These exercise the real `getSiteContent()` — imported from `src/`, not
 * re-implemented here — against a real local D1 created from the real
 * migrations, through the real composition boundary. What they are actually
 * protecting is the two things most likely to go wrong on a public site:
 *
 *   1. **The publication filter.** A draft project or a hidden row appearing
 *      on the public site is the worst failure this app has. It is asserted
 *      by seeding rows that must not appear and checking they do not, rather
 *      than by trusting that `visibleOnly` was passed.
 *   2. **The domain → view-model mapping.** Period strings, paragraph
 *      splitting, link availability and image resolution are all decisions
 *      made in one function, and all of them are easy to get quietly wrong.
 *
 * Local only: a disposable temp D1 created by `getPlatformProxy()`, torn down
 * at the end. No Cloudflare authentication, no network, no `--remote`.
 */

import { spawnSync } from "node:child_process";
import { SECTION_KEYS } from "../src/lib/content/sections.ts";
import { createRequire, registerHooks } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The app's `@/*` alias, which Next resolves via tsconfig `paths` and plain
 * Node does not. Mapped here rather than changing app code for a test.
 */
const srcRoot = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rest = specifier.slice(2);
      const withExtension = /\.[cm]?tsx?$/.test(rest) ? rest : `${rest}.ts`;
      return nextResolve(new URL(withExtension, srcRoot).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { getPlatformProxy } = await import("wrangler");
const { createRepositories } = await import("@portfolio/database");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const configPath = join(repoRoot, "wrangler.d1.jsonc");
const DATABASE = "portfolio-cms";

/**
 * Wrangler's executable, resolved through its manifest rather than by path.
 *
 * `require.resolve("wrangler/bin/wrangler.js")` fails: the package's
 * `exports` map does not expose that subpath. Reading `bin` from the manifest
 * asks the package where its executable is instead of assuming.
 */
function wranglerBin() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("wrangler/package.json", { paths: [repoRoot] });
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.wrangler;
  return resolve(dirname(manifestPath), bin);
}

const failures = [];
let checks = 0;
let group = "";

function startGroup(name) {
  group = name;
  console.log(`\n${name}`);
}

function check(description, passed, detail = "") {
  checks += 1;
  if (passed) {
    console.log(`  PASS  ${description}`);
  } else {
    console.log(`  FAIL  ${description}${detail ? ` — ${detail}` : ""}`);
    failures.push(`${group}: ${description}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(description, actual, expected) {
  check(
    description,
    Object.is(actual, expected),
    Object.is(actual, expected)
      ? ""
      : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

let persistRoot = null;
let platform = null;

try {
  persistRoot = mkdtempSync(join(tmpdir(), "portfolio-site-content-"));

  const migrate = spawnSync(
    process.execPath,
    [
      wranglerBin(),
      "d1", "migrations", "apply", DATABASE,
      "--local", "-c", configPath, "--persist-to", persistRoot,
    ],
    { cwd: repoRoot, encoding: "utf8", shell: false },
  );

  startGroup("Setup");
  check(
    "every migration applies to a disposable local database",
    migrate.status === 0,
    (migrate.stderr || migrate.stdout || "").slice(-300),
  );

  platform = await getPlatformProxy({
    configPath,
    persist: { path: join(persistRoot, "v3") },
    remoteBindings: false,
  });
  const db = platform.env.DB;
  const repos = createRepositories(db);

  // Point the real composition boundary at this disposable database — the
  // same seam Phase 22 will use for the OpenNext provider.
  const binding = await import("../src/lib/db/binding.ts");
  binding.setSiteDatabaseProvider(async () => db);

  const { getSiteContent } = await import("../src/lib/content/site-content.ts");

  // =========================================================================
  // An empty database is a valid state.
  // =========================================================================
  startGroup("Empty database");

  const empty = await getSiteContent();
  check("it returns content rather than throwing", Boolean(empty));
  equal("the site name falls back", empty.siteName, "Portfolio");
  equal("the profile name falls back", empty.profile.name, "Portfolio");
  check(
    "the fallback role says the site is not set up",
    empty.profile.role.toLowerCase().includes("not set up"),
  );
  equal("no biography paragraphs", empty.profile.introduction.length, 0);
  equal("no profile image", empty.profile.image, null);
  for (const key of [
    "projects", "timeline", "education", "certifications",
    "skillCategories", "tools",
  ]) {
    equal(`${key} is empty rather than absent`, empty[key].length, 0);
  }
  equal(
    "the email action is unavailable with a reason",
    empty.contact.primaryAction.status,
    "unavailable",
  );

  // =========================================================================
  // Seed. Deliberately includes rows that must NOT reach the public site.
  // =========================================================================
  startGroup("Seed");

  const described = await repos.media.create({
    storageKey: "media/described.png",
    contentType: "image/png",
    byteSize: 128,
    altText: "A described logo",
  });
  // An asset with no alt text. Nothing may render it — see below.
  const undescribed = await repos.media.create({
    storageKey: "media/undescribed.png",
    contentType: "image/png",
    byteSize: 128,
    altText: null,
  });
  check("two media assets exist", Boolean(described.id && undescribed.id));

  await repos.profile.upsert({
    fullName: "Ada Lovelace",
    headline: "Analytical Engineer",
    tagline: "Notes on the Analytical Engine.",
    bio: "First paragraph.\n\nSecond paragraph.",
    location: "London",
    availability: "Open to work",
    publicEmail: "ada@example.com",
    avatarMediaId: described.id,
  });

  const published = await repos.projects.create({
    slug: "published-project",
    title: "Published Project",
    summary: "Visible to the public.",
    status: "published",
    periodLabel: "2024 – present",
    iconMediaId: described.id,
  });
  await repos.projects.setLinks(published.id, [
    { label: "Source", url: "https://example.com/src", kind: "repository", position: 0 },
  ]);
  await repos.projects.create({
    slug: "draft-project",
    title: "Draft Project",
    summary: "MUST NOT appear on the public site.",
    status: "draft",
  });
  await repos.projects.create({
    slug: "archived-project",
    title: "Archived Project",
    summary: "MUST NOT appear on the public site.",
    status: "archived",
  });

  await repos.tools.create({
    name: "Visible Tool",
    purpose: "Shown",
    isVisible: true,
    iconMediaId: undescribed.id,
  });
  await repos.tools.create({
    name: "Hidden Tool",
    purpose: "MUST NOT appear",
    isVisible: false,
  });

  await repos.timeline.create({
    role: "Engineer",
    organization: "Example Ltd",
    startedOn: "2022-01-01",
    isVisible: true,
  });
  await repos.timeline.create({
    role: "Hidden Role",
    organization: "Hidden Ltd",
    isVisible: false,
  });

  await repos.certifications.create({
    title: "A Certification",
    issuer: "An Issuer",
    issuedOn: "2023-06-01",
    isVisible: true,
  });

  const content = await getSiteContent();

  // =========================================================================
  // The publication filter. The most important assertions in this file.
  // =========================================================================
  startGroup("Publication filter");

  const projectTitles = content.projects.map((project) => project.title);
  equal("exactly one project is public", content.projects.length, 1);
  check("the published project is present", projectTitles.includes("Published Project"));
  check(
    "the DRAFT project is absent",
    !projectTitles.includes("Draft Project"),
    `got ${JSON.stringify(projectTitles)}`,
  );
  check(
    "the ARCHIVED project is absent",
    !projectTitles.includes("Archived Project"),
    `got ${JSON.stringify(projectTitles)}`,
  );

  const toolNames = content.tools.map((tool) => tool.name);
  check("the visible tool is present", toolNames.includes("Visible Tool"));
  check(
    "the HIDDEN tool is absent",
    !toolNames.includes("Hidden Tool"),
    `got ${JSON.stringify(toolNames)}`,
  );

  const roles = content.timeline.map((entry) => entry.role);
  check("the visible timeline entry is present", roles.includes("Engineer"));
  check(
    "the HIDDEN timeline entry is absent",
    !roles.includes("Hidden Role"),
    `got ${JSON.stringify(roles)}`,
  );

  // =========================================================================
  // Mapping.
  // =========================================================================
  startGroup("Profile mapping");

  equal("the name comes from the profile", content.profile.name, "Ada Lovelace");
  equal("the role is the headline", content.profile.role, "Analytical Engineer");
  equal("the site name follows the profile", content.siteName, "Ada Lovelace");
  equal("the bio splits on blank lines", content.profile.introduction.length, 2);
  equal(
    "the first paragraph is intact",
    content.profile.introduction[0],
    "First paragraph.",
  );
  equal(
    "a public email becomes an available action",
    content.contact.primaryAction.status,
    "available",
  );
  equal(
    "the email action is a mailto",
    content.contact.primaryAction.href,
    "mailto:ada@example.com",
  );
  equal(
    "the contact form action stays unavailable — it is not built",
    content.contact.secondaryAction.status,
    "unavailable",
  );

  startGroup("Image resolution");

  equal("the avatar resolves", content.profile.image?.id, described.id);
  equal("the avatar carries its alt text", content.profile.image?.alt, "A described logo");
  // The accessible failure mode: an image nobody can describe is not rendered.
  const visibleTool = content.tools.find((tool) => tool.name === "Visible Tool");
  equal(
    "an asset with NO alt text is dropped rather than rendered",
    visibleTool?.image,
    null,
  );

  startGroup("Period and link mapping");

  const publicProject = content.projects[0];
  equal(
    "an editor's period label wins over date formatting",
    publicProject.year,
    "2024 – present",
  );
  equal(
    "a repository link becomes available",
    publicProject.repository.status,
    "available",
  );
  equal(
    "a missing live link is unavailable, with a reason",
    publicProject.liveSite.status,
    "unavailable",
  );
  check(
    "the unavailable link explains itself",
    publicProject.liveSite.reason.length > 0,
  );
  equal(
    "a start date with no end reads as ongoing",
    content.timeline[0].period,
    "2022 – present",
  );
  equal(
    "a certification shows its issue year",
    content.certifications[0].issued,
    "2023",
  );

  // =========================================================================
  // Section order, retitling and hiding.
  // =========================================================================
  startGroup("Section resolution");

  const defaults = await getSiteContent();
  // Counted from the module's own list rather than written out, so adding a
  // section is a one-line change there instead of a hunt through this file.
  // The *order* below is still spelled out: that is the thing under test.
  equal(
    "with no rows, every known section renders",
    defaults.sections.length,
    SECTION_KEYS.length,
  );
  equal(
    "and in the declared default order",
    defaults.sections.map((section) => section.key).join(","),
    "about,projects,experience,education,skills,playground,contact",
  );
  equal(
    "navigation is derived from the same list",
    defaults.navigation.map((item) => item.targetId).join(","),
    defaults.sections.map((section) => section.key).join(","),
  );

  // A row overrides position and copy for its key.
  const contactRow = await repos.sections.create({
    key: "contact",
    title: "Say hello",
    position: 0,
    isVisible: true,
  });
  const reordered = await getSiteContent();
  equal(
    "a row moves its section to the given position",
    reordered.sections[0].key,
    "contact",
  );
  equal(
    "a row retitles its section",
    reordered.sections[0].title,
    "Say hello",
  );
  equal(
    "sections with no row keep their relative order after it",
    reordered.sections.map((section) => section.key).join(","),
    "contact,about,projects,experience,education,skills,playground",
  );
  equal(
    "the navigation label follows the new title",
    reordered.navigation[0].label,
    "Say hello",
  );
  equal(
    "a row does NOT delete the sections that have no row",
    reordered.sections.length,
    SECTION_KEYS.length,
  );

  // Hiding. This is the case that broke in the browser: reading sections with
  // `visibleOnly` removed the hidden row entirely, which the resolver could
  // not tell apart from "no row", so the section reappeared with its default
  // title. The fix is to read every row and let `isVisible` decide.
  await repos.sections.update(contactRow.id, { isVisible: false });
  const hidden = await getSiteContent();
  check(
    "hiding a section removes it from the page",
    !hidden.sections.some((section) => section.key === "contact"),
    `got ${JSON.stringify(hidden.sections.map((s) => s.key))}`,
  );
  check(
    "and removes its navigation link, leaving nothing pointing at it",
    !hidden.navigation.some((item) => item.targetId === "contact"),
  );
  equal(
    "every other section still renders",
    hidden.sections.length,
    SECTION_KEYS.length - 1,
  );

  // A key no component knows about is ignored rather than rendered empty.
  await repos.sections.create({
    key: "podcast",
    title: "Podcast",
    position: 1,
    isVisible: true,
  });
  const unknown = await getSiteContent();
  check(
    "an unknown section key is ignored",
    !unknown.sections.some((section) => section.key === "podcast"),
    `got ${JSON.stringify(unknown.sections.map((s) => s.key))}`,
  );
  // One fewer than the full set, because `contact` is still hidden from the
  // previous step. Derived rather than written out, so a new section does
  // not silently turn this into a stale number.
  equal(
    "and changes nothing else",
    unknown.sections.length,
    SECTION_KEYS.length - 1,
  );


  // =========================================================================
  // Project detail pages. The publication rule again, from the other side.
  // =========================================================================
  startGroup("Project detail");

  const { getProjectDetail, listPublishedProjectSlugs } = await import(
    "../src/lib/content/project-detail.ts"
  );

  const detail = await getProjectDetail("published-project");
  check("a published project resolves", detail !== null);
  equal("with its title", detail?.title, "Published Project");
  equal("and its period label", detail?.period, "2024 – present");
  equal(
    "an editor-supplied link label wins over the kind",
    detail?.links[0]?.label,
    "Source",
  );

  // The assertions that matter. A draft must be indistinguishable from a slug
  // that was never used: anything else confirms the slug exists, which is
  // what a draft is meant not to reveal.
  equal(
    "a DRAFT project resolves to null, exactly like a missing one",
    await getProjectDetail("draft-project"),
    null,
  );
  equal(
    "an ARCHIVED project resolves to null",
    await getProjectDetail("archived-project"),
    null,
  );
  equal(
    "an unknown slug resolves to null",
    await getProjectDetail("no-such-project-anywhere"),
    null,
  );

  const slugs = await listPublishedProjectSlugs();
  equal("only published slugs are listed", slugs.length, 1);
  equal("and it is the published one", slugs[0], "published-project");

  // An image with no alt text is dropped here too, and its caption goes with
  // it — a caption under an image that is not there is worse than neither.
  await repos.projects.setMedia(published.id, [
    { mediaAssetId: undescribed.id, caption: "Should not appear", position: 0 },
    { mediaAssetId: described.id, caption: "A described shot", position: 1 },
  ]);
  const withGallery = await getProjectDetail("published-project");
  equal("only the described image reaches the gallery", withGallery?.gallery.length, 1);
  equal(
    "and it keeps its caption",
    withGallery?.gallery[0]?.caption,
    "A described shot",
  );
  equal(
    "the undescribed image's caption is dropped with it",
    withGallery?.gallery.some((item) => item.caption === "Should not appear"),
    false,
  );


  // =========================================================================
  // Theme settings.
  // =========================================================================
  startGroup("Theme settings");

  // With no settings row at all, the site still has to render.
  equal("theme falls back to system", content.theme.defaultTheme, "system");
  equal("no accent override", content.theme.accentColor, null);
  equal("no favicon override", content.theme.favicon, null);
  equal(
    "contact is enabled by default -- a portfolio with no way to make contact is the wrong default",
    content.isContactEnabled,
    true,
  );
  check(
    "the contact section is present when enabled",
    content.sections.some((section) => section.key === "contact"),
  );

  await repos.siteSettings.upsert({
    siteName: "Ada's Work",
    siteDescription: "Notes and engines.",
    defaultTheme: "dark",
    accentColor: "#7c3aed",
    faviconMediaId: described.id,
    isContactEnabled: false,
  });
  const themed = await getSiteContent();

  equal("the settings row owns the site name", themed.siteName, "Ada's Work");
  equal("and the description", themed.siteDescription, "Notes and engines.");
  equal("the pinned theme is carried", themed.theme.defaultTheme, "dark");
  equal("the accent is carried", themed.theme.accentColor, "#7c3aed");
  equal(
    "the favicon resolves to a media URL",
    themed.theme.favicon?.href,
    `/media/${described.id}`,
  );
  equal(
    "and declares the stored content type rather than guessing from the URL",
    themed.theme.favicon?.type,
    "image/png",
  );

  // Disabling contact must remove the section, or the navigation -- derived
  // from the same list -- keeps a link pointing at markup that is not there.
  check(
    "disabling contact removes the section",
    !themed.sections.some((section) => section.key === "contact"),
    `got ${JSON.stringify(themed.sections.map((s) => s.key))}`,
  );
  check(
    "and its navigation link",
    !themed.navigation.some((item) => item.targetId === "contact"),
  );

  // A broken favicon link turns out to be unreachable rather than handled,
  // and the guarantee is worth asserting rather than assuming. Two mechanisms
  // hold it: the foreign key refuses an id that does not exist, and deleting
  // the asset sets the column to NULL rather than leaving it dangling.
  let refusedUnknownAsset = false;
  try {
    await repos.siteSettings.upsert({
      siteName: "Ada's Work",
      faviconMediaId: "no-such-asset-id",
      isContactEnabled: true,
    });
  } catch {
    refusedUnknownAsset = true;
  }
  check(
    "the foreign key refuses a favicon id that does not exist",
    refusedUnknownAsset,
  );

  const doomed = await repos.media.create({
    storageKey: "media/doomed.png",
    contentType: "image/png",
    byteSize: 64,
    altText: "About to be deleted",
  });
  await repos.siteSettings.upsert({
    siteName: "Ada's Work",
    faviconMediaId: doomed.id,
    isContactEnabled: true,
  });
  check(
    "a favicon can be set to a real asset",
    (await getSiteContent()).theme.favicon !== null,
  );

  await repos.media.delete(doomed.id);
  equal(
    "deleting that asset clears the favicon rather than leaving a broken link",
    (await getSiteContent()).theme.favicon,
    null,
  );


  // =========================================================================
  // Contact form. The only untrusted-input boundary on this site.
  // =========================================================================
  startGroup("Contact form");

  const {
    contactMessageSchema,
    isTooFast,
    HONEYPOT_FIELD,
    MINIMUM_COMPLETION_MS,
  } = await import("@portfolio/schemas");

  const validMessage = {
    senderName: "Ada Lovelace",
    senderEmail: "ada@example.com",
    subject: "Collaboration",
    body: "I would like to talk about a project.",
    startedAt: 1_700_000_000_000,
  };

  check(
    "a well-formed message parses",
    contactMessageSchema.safeParse(validMessage).success,
  );
  equal(
    "a blank subject becomes null rather than an empty string",
    contactMessageSchema.safeParse({ ...validMessage, subject: "  " }).data?.subject,
    null,
  );

  // The honeypot. A human never fills it; a naive bot fills everything.
  check(
    "a filled honeypot is rejected",
    !contactMessageSchema.safeParse({
      ...validMessage,
      [HONEYPOT_FIELD]: "http://spam.example",
    }).success,
  );
  check(
    "an absent honeypot is fine -- it must not be required",
    contactMessageSchema.safeParse(validMessage).success,
  );

  // Length ceilings, so one request cannot write megabytes.
  check(
    "an over-long body is rejected",
    !contactMessageSchema.safeParse({
      ...validMessage,
      body: "x".repeat(4001),
    }).success,
  );
  check(
    "an over-long name is rejected",
    !contactMessageSchema.safeParse({
      ...validMessage,
      senderName: "x".repeat(121),
    }).success,
  );
  check(
    "a malformed email is rejected",
    !contactMessageSchema.safeParse({
      ...validMessage,
      senderEmail: "not-an-address",
    }).success,
  );
  check(
    "an unknown field is rejected outright rather than stripped",
    !contactMessageSchema.safeParse({ ...validMessage, isAdmin: true }).success,
  );
  check(
    "a missing timestamp is rejected",
    !contactMessageSchema.safeParse({
      senderName: "Ada",
      senderEmail: "ada@example.com",
      body: "Hello",
    }).success,
  );

  // The timing check is pure and takes the clock as an argument, so it can be
  // asserted exactly rather than by sleeping.
  const now = 1_700_000_010_000;
  check(
    "a submission inside the minimum window is too fast",
    isTooFast(now - (MINIMUM_COMPLETION_MS - 1), now),
  );
  check(
    "a submission past the window is not",
    !isTooFast(now - (MINIMUM_COMPLETION_MS + 1), now),
  );

  // The write itself, through the real repository.
  const before = (await repos.contactMessages.list()).length;
  await repos.contactMessages.create({
    senderName: "Ada Lovelace",
    senderEmail: "ada@example.com",
    subject: "Collaboration",
    body: "I would like to talk about a project.",
    sourceCountry: null,
  });
  const stored = await repos.contactMessages.list();
  equal("the message is stored", stored.length, before + 1);
  equal("and arrives unread", stored[0]?.status, "unread");
  equal(
    "with no country when the header is absent -- no IP is ever stored",
    stored[0]?.sourceCountry,
    null,
  );

  const readBack = await repos.contactMessages.setStatus(stored[0].id, "read");
  equal("marking read updates the status", readBack.status, "read");
  check(
    "and stamps read_at, which is the repository's rule rather than the caller's",
    readBack.readAt !== null,
  );


  // =========================================================================
  // Motion. A structural check, not a visual one.
  // =========================================================================
  startGroup("Scroll reveals");

  // What this protects: the reveal must never hide content in a browser that
  // cannot animate it, or for a visitor who asked for less motion. Both
  // guarantees come from *where* the rule sits rather than from anything
  // observable at runtime, so the source is what gets asserted -- a browser
  // test cannot check the branch its own browser does not take.
  const motionCss = readFileSync(
    join(repoRoot, "packages", "ui", "src", "motion.css"),
    "utf8",
  );

  const supportsIndex = motionCss.indexOf("@supports (animation-timeline: view())");
  const reducedIndex = motionCss.indexOf("prefers-reduced-motion: no-preference");
  const animationIndex = motionCss.indexOf("animation: portfolio-reveal");

  check("the reveal is guarded by @supports", supportsIndex !== -1);
  check(
    "and by prefers-reduced-motion: no-preference",
    reducedIndex !== -1,
  );
  check(
    "the animation is declared INSIDE both guards, so a browser that cannot run it never applies the hidden state",
    supportsIndex !== -1 &&
      reducedIndex !== -1 &&
      animationIndex > supportsIndex &&
      animationIndex > reducedIndex,
  );

  // The hidden state must live in the keyframes, which only apply when the
  // animation does -- never as a bare rule on `.reveal`.
  const bareHidden = /\.reveal\s*\{[^}]*opacity:\s*0/.test(motionCss);
  check(
    "no bare `.reveal { opacity: 0 }` exists outside the keyframes",
    !bareHidden,
  );

} catch (error) {
  checks += 1;
  failures.push(`unexpected error: ${error?.message ?? error}`);
  console.error("\nSite content tests aborted:", error);
} finally {
  if (platform) {
    await platform.dispose();
    console.log("\nDisposed the platform proxy.");
  }
  if (persistRoot) {
    rmSync(persistRoot, { recursive: true, force: true });
    console.log(`Removed temporary D1 state: ${persistRoot}`);
  }
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("Site content tests passed.");
