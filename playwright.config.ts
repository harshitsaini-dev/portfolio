import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * ## Why these tests exist at all
 *
 * The suites under `apps/*​/scripts` are fast and they are the right tool for
 * pure logic — content mapping, repository behaviour, Server Action
 * authorization. What they cannot see is the browser: a mask that leaves a
 * seam, a dialog that appears without animating, a theme choice that loses to
 * a media query, an image that overflows the viewport.
 *
 * Every test in `e2e/` is a regression test for a defect that actually shipped
 * into this repository and was found by measuring a real page. None of them
 * were written speculatively.
 *
 * ## Against `next dev`, and what that costs
 *
 * `next start` cannot run outside Wrangler: there is no D1 binding, and the
 * database seam fails closed by design, so every route throws. The dev server
 * gets its binding from `getPlatformProxy()` and miniflare's local state.
 *
 * The cost is that timings here are dev timings — compile-dominated and not
 * comparable to production. So nothing in this suite asserts on a duration.
 * Structure, geometry and computed styles are all reliable; milliseconds are
 * not.
 *
 * ## No seeded content
 *
 * CI applies migrations to an empty local database, so these tests run against
 * a site with **no CMS rows at all**. That is deliberate: it is the one state
 * guaranteed to be reproducible on any machine, and the site is required to
 * render its default sections without content anyway. Anything that needs a
 * particular project or image belongs in the node suites, not here.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial. The suite drives one dev server, and a Next dev server compiling
  // several routes at once under parallel workers is slow enough to look like
  // a hang.
  workers: 1,
  fullyParallel: false,
  // A failing assertion should fail, not be retried until it passes. A flaky
  // e2e test that CI retries green is worse than no test.
  retries: 0,
  // Generous, because the first navigation pays for a cold compile.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // Only on failure: a passing run should leave nothing behind.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      // A real phone descriptor rather than a narrow desktop window. It
      // matters: Playwright's desktop Chrome reports a *fine* pointer even at
      // 390px, which made an earlier hand-rolled check report a phone
      // downloading the hover-only x-ray overlay it would never load.
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @portfolio/web dev",
    url: "http://localhost:3000",
    // Locally the server is usually already running; reusing it saves a cold
    // start. CI always starts its own.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
