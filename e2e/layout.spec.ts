import { expect, test } from "@playwright/test";

/**
 * Nothing may push the page sideways.
 *
 * The mobile audit found the hero portrait rendering at a fixed 520x520 on a
 * 390px phone — 150px past the edge — because `ContentImage` wrote an inline
 * `width`/`height`, and an inline style beats a class, so the hero's
 * responsive height classes had never applied at any width.
 *
 * The check is deliberately written against the *document*, not against that
 * one image: a horizontal scrollbar on a phone is the symptom, whatever
 * causes it, and pinning the test to the portrait would miss the next thing
 * that overflows.
 */

/**
 * Wait for the entrance animation to settle before measuring.
 *
 * `page-enter` scales and translates `main`, and `getBoundingClientRect`
 * reports the *transformed* box — which reads as overflow. That artifact cost
 * real time during the audit: `main` measured 385px wide in a 380px viewport
 * and there was no layout bug at all.
 */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    if (!main) return false;
    // `main.getAnimations()` — its own animations only, not the subtree, and
    // certainly not `document.getAnimations()`.
    //
    // Waiting on the whole document never returns: the cursor ring and the
    // robot run permanent loops by design, so "every animation has stopped" is
    // never true and the first version of this helper hung until the test
    // timed out. `page-enter` is the only one that has to finish before the
    // geometry is meaningful.
    return main.getAnimations().every((a) => a.playState === "finished");
  });
  // The entrance animation ends with a committed transform; give the browser
  // one frame to lay out with it before anything is measured.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
}

test("the document does not scroll horizontally", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });

  // One pixel of slack for sub-pixel rounding, not for a real overflow.
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test("every image stays inside the viewport", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  const escaping = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll("img")]
      .filter((img) => {
        const r = img.getBoundingClientRect();
        if (r.width === 0) return false;
        // Anything inside a deliberate horizontal scroller is allowed to be
        // wider than the screen — that is what the scroller is for.
        for (let p = img.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden") return false;
        }
        return r.right > vw + 1 || r.left < -1;
      })
      .map((img) => {
        const r = img.getBoundingClientRect();
        return `${img.currentSrc || img.src} at ${Math.round(r.left)}..${Math.round(r.right)} in ${vw}`;
      });
  });

  expect(escaping).toEqual([]);
});

/**
 * WCAG 2.5.8 Target Size (Minimum), the AA requirement: 24 by 24 CSS pixels.
 *
 * Not 44. The first version of this test asserted 44px — the AAA figure and
 * the common mobile guideline — and it failed on three project-card titles at
 * 23px. Raising every text link on the site to 44px would have been a design
 * change made to satisfy a number the project never committed to, so the test
 * now asserts the level the site actually claims, and the 23px titles were
 * fixed because they missed even that, by one pixel.
 */
const MIN_TARGET_PX = 24;

test("interactive controls meet the minimum target size", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  const small = await page.evaluate((min) => {
    return [...document.querySelectorAll("a, button")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (getComputedStyle(el).visibility === "hidden") return false;

        // The skip link, and anything else visually hidden until focused. It
        // measures 32x16 while parked offscreen and full size the moment it is
        // focused, which is the only state in which anyone can hit it —
        // measuring the parked box tests nothing real.
        if (el.closest(".sr-only, .focus\\:not-sr-only")) return false;
        if (r.left < 0 || r.top < 0) return false;

        // Links inside a paragraph are exempt under 2.5.8, and spacing prose
        // out to satisfy a hit area would make the page worse to read.
        if (el.parentElement?.tagName === "P") return false;

        return r.height < min || r.width < min;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute("aria-label") || el.textContent || "")
          .trim()
          .slice(0, 30);
        return `${label} — ${Math.round(r.width)}x${Math.round(r.height)}`;
      });
  }, MIN_TARGET_PX);

  expect(small).toEqual([]);
});
