import { expect, test } from "@playwright/test";

/**
 * The theme choice must beat the system preference.
 *
 * This is a regression test for a real defect: `:root[data-theme="light"]`
 * declared only `color-scheme`, while `@media (prefers-color-scheme: dark)`
 * declared the whole palette at equal specificity and later in the file — so
 * a visitor whose OS prefers dark and who explicitly picked light got **no
 * change at all**. The toggle was broken in precisely the case it exists for.
 *
 * It survived a long time because the opposite direction works: the dark
 * override does spell out a full palette, so dark-on-a-light-machine was
 * always fine, and that is the direction anyone testing on a light laptop
 * tries. Both directions are asserted below for exactly that reason.
 */

const THEME_KEY = "portfolio-theme";

/** The `--bg` token, which differs between the two palettes. */
async function background(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
  );
}

const LIGHT_BG = "#fbfbfc";
const DARK_BG = "#0b0c10";

for (const osPrefers of ["light", "dark"] as const) {
  test.describe(`with the OS preferring ${osPrefers}`, () => {
    test.use({ colorScheme: osPrefers });

    for (const chosen of ["light", "dark"] as const) {
      test(`an explicit ${chosen} choice wins`, async ({ page }) => {
        await page.goto("/");
        await page.evaluate(
          ([key, value]) => window.localStorage.setItem(key, value),
          [THEME_KEY, chosen],
        );
        await page.reload();
        // The pre-paint script writes the attribute before first paint, so
        // there is no flash to wait out.
        await expect(page.locator("html")).toHaveAttribute("data-theme", chosen);

        expect(await background(page)).toBe(
          chosen === "light" ? LIGHT_BG : DARK_BG,
        );
      });
    }

    test("clearing the choice hands control back to the site default", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate((key) => window.localStorage.removeItem(key), THEME_KEY);
      await page.reload();

      // Deliberately not asserting *which* palette appears. With no stored
      // choice the site renders the CMS `defaultTheme`, which an editor can
      // change — pinning it here would make this test fail on a content edit
      // rather than on a regression. What must hold is that the palette is
      // one of the two, fully applied, and not a mixture of both.
      const bg = await background(page);
      expect([LIGHT_BG, DARK_BG]).toContain(bg);

      const fg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--fg").trim(),
      );
      // The mixture is the actual failure mode this guards: a light background
      // with a light foreground was how the original bug would have surfaced.
      expect(fg).toBe(bg === LIGHT_BG ? "#12131a" : "#f1f2f5");
    });
  });
}
