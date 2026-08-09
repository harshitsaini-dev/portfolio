import { expect, test } from "@playwright/test";

/**
 * The narrow-viewport navigation drawer must animate.
 *
 * It did not, and the reason was structural rather than a missing class:
 * `showModal()` moves the element from `display: none` into the top layer in
 * one step, and a transition needs a previous computed value to interpolate
 * from — a `display: none` element has no rendered frame at all, so the drawer
 * was always painted fully open.
 *
 * Three declarations make it work and it is broken without any one of them:
 * `@starting-style` supplies the missing first frame, `allow-discrete` on
 * `display` defers the flip to the end of the close so the panel is still
 * visible while it slides out, and `overlay` must transition too or the
 * element leaves the top layer the instant `close()` is called and the exit
 * plays somewhere invisible.
 *
 * So the assertions below are about *intermediate* states, not end states. A
 * test that only checked "open" and "closed" would have passed against the
 * broken version.
 */

// The drawer and its trigger are `md:hidden`.
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) >= 768,
  "the drawer only exists below the md breakpoint",
);

test("it slides in rather than appearing", async ({ page }) => {
  await page.goto("/");

  const drawer = page.locator(".nav-drawer");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: /menu/i }).click();

  // Sample while it opens. The panel must be caught *between* offscreen and
  // its resting place — that intermediate position is the whole feature.
  const positions = await page.evaluate(async () => {
    const el = document.querySelector(".nav-drawer")!;
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(el.getBoundingClientRect().left);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return seen;
  });

  const distinct = new Set(positions.map((p) => Math.round(p)));
  expect(
    distinct.size,
    `the drawer jumped straight to its final position: ${[...distinct].join(", ")}`,
  ).toBeGreaterThan(1);

  await expect(drawer).toBeVisible();
});

test("it stays visible while sliding out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).click();
  await expect(page.locator(".nav-drawer")).toBeVisible();

  // This is the `allow-discrete` assertion. Without it `display` flips to
  // `none` immediately and the panel vanishes instead of leaving.
  const frames = await page.evaluate(async () => {
    const el = document.querySelector(".nav-drawer") as HTMLDialogElement;
    el.close();
    const seen: { display: string; left: number }[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push({
        display: getComputedStyle(el).display,
        left: el.getBoundingClientRect().left,
      });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return seen;
  });

  const movedWhileVisible = frames.filter((f) => f.display !== "none");
  expect(movedWhileVisible.length).toBeGreaterThan(1);
  const lefts = new Set(movedWhileVisible.map((f) => Math.round(f.left)));
  expect(
    lefts.size,
    "the drawer disappeared instead of sliding out",
  ).toBeGreaterThan(1);

  await expect(page.locator(".nav-drawer")).toBeHidden();
});

test("Escape closes it and choosing a link closes it", async ({ page }) => {
  await page.goto("/");
  const drawer = page.locator(".nav-drawer");

  await page.getByRole("button", { name: /menu/i }).click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: /menu/i }).click();
  await expect(drawer).toBeVisible();
  // Closing on selection is the reason this is a client component at all: the
  // drawer would otherwise cover the section the visitor just asked for.
  await drawer.getByRole("link").first().click();
  await expect(drawer).toBeHidden();
});
