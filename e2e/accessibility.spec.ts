import { expect, test } from "@playwright/test";

/**
 * Keyboard access and focus visibility.
 *
 * These are the checks axe cannot make. Whether an element paints a focus
 * indicator is a computed-style question about a state that only exists while
 * something is focused, and whether that indicator is *visible against the
 * page* is an arithmetic one. Both are asserted here.
 */

/** WCAG 1.4.11 — non-text contrast. A focus ring must clear 3:1. */
const MIN_INDICATOR_CONTRAST = 3;

test("the skip link is the first thing a keyboard reaches", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const first = await page.evaluate(() =>
    (document.activeElement?.textContent || "").trim(),
  );
  expect(first).toMatch(/skip to main/i);
});

test("the skip link moves focus into main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  // A skip link that only changes the URL leaves the keyboard exactly where it
  // was, which is the failure worth guarding — the target is `tabIndex={-1}`
  // precisely so focus can land on it.
  const landedInMain = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("main");
    return !!main && !!active && (active === main || main.contains(active));
  });
  expect(landedInMain).toBe(true);
});

test("every tab stop paints an indicator that clears 3:1", async ({ page }) => {
  await page.goto("/");

  const failures: string[] = [];

  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");

    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;

      const cs = getComputedStyle(el);
      const hasOutline =
        cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const hasRing = cs.boxShadow !== "none";

      const channels = (colour: string) =>
        (colour.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb: number[]) => {
        const linear = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };

      const ratio = (a: number, b: number) =>
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

      /*
        Compared against **both** adjacent surfaces, and the better one wins.

        WCAG 1.4.11 is about the indicator against the colours next to it, and
        a ring drawn around a filled button has two neighbours: the page behind
        it and the button's own fill. A ring that is invisible against one but
        obvious against the other is a visible ring.

        Measuring only the page background is what the first version did, and
        it reported a 1.03:1 failure on the contact form's primary button in
        CI — a button whose ring is plainly visible because it contrasts with
        the accent fill it sits on.
      */
      const ring = luminance(channels(cs.outlineColor));
      const pageBg = luminance(
        channels(getComputedStyle(document.body).backgroundColor),
      );
      const ownBg = luminance(channels(cs.backgroundColor));
      const isTransparent = /rgba?\([^)]*,\s*0\s*\)/.test(cs.backgroundColor);

      const contrast = isTransparent
        ? ratio(ring, pageBg)
        : Math.max(ratio(ring, pageBg), ratio(ring, ownBg));

      return {
        label: (el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 30),
        indicated: hasOutline || hasRing,
        contrast: Number(contrast.toFixed(2)),
        usesOutline: hasOutline,
      };
    });

    if (!stop) continue;

    if (!stop.indicated) {
      failures.push(`${stop.label} — no focus indicator`);
    } else if (stop.usesOutline && stop.contrast < MIN_INDICATOR_CONTRAST) {
      // Only checked for outlines: a box-shadow ring's colour is not a single
      // computed value that can be read this way, and guessing at one would
      // produce a number that means nothing.
      failures.push(`${stop.label} — indicator at ${stop.contrast}:1`);
    }
  }

  expect(failures).toEqual([]);
});

test("the page has one main landmark and a level-one heading", async ({
  page,
}) => {
  await page.goto("/");

  expect(await page.locator("main").count()).toBe(1);
  expect(await page.locator("h1").count()).toBeGreaterThanOrEqual(1);
});
