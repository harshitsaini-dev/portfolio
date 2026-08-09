import { expect, test } from "@playwright/test";

/**
 * The Content-Security-Policy, and the thing it must not break.
 *
 * A CSP is unusually easy to ship broken in a way nobody notices: the header
 * is present, the page looks right, and one blocked script means a stored
 * theme preference no longer applies or a form silently stops working. So
 * these tests check the policy's *shape*, and then check that the page still
 * does the things the policy could have broken.
 */

test("the policy is served with a per-request nonce", async ({ page }) => {
  const first = await page.goto("/");
  const second = await page.goto("/?again");

  const policyOf = async (response: typeof first) => {
    const headers = await response!.allHeaders();
    return headers["content-security-policy"] ?? "";
  };

  const a = await policyOf(first);
  const b = await policyOf(second);

  expect(a, "no Content-Security-Policy header").not.toBe("");

  // The directives that carry the weight. `'unsafe-inline'` in `script-src`
  // would make the whole exercise decorative, so its absence is asserted
  // rather than assumed.
  expect(a).toContain("default-src 'self'");
  expect(a).toContain("'strict-dynamic'");
  expect(a).toContain("object-src 'none'");
  expect(a).toContain("frame-ancestors 'none'");
  expect(a).toContain("base-uri 'self'");
  expect(a).toContain("form-action 'self'");
  expect(a).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  const nonceOf = (policy: string) => policy.match(/'nonce-([^']+)'/)?.[1];
  const first_nonce = nonceOf(a);
  const second_nonce = nonceOf(b);

  expect(first_nonce, "no nonce in script-src").toBeTruthy();
  // A nonce reused across responses is a nonce an attacker can read off one
  // page and use on the next, which is the same as having none.
  expect(second_nonce).not.toBe(first_nonce);
});

test("nothing on the page is blocked by it", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(text)) {
      blocked.push(text.slice(0, 200));
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(blocked).toEqual([]);
});

test("the inline theme script still runs", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.localStorage.setItem("portfolio-theme", "light"),
  );
  await page.reload();

  // This is the assertion that matters most. The theme script is inline and
  // runs before paint; if the CSP blocks it the page still renders, still
  // looks fine to whoever is testing, and quietly ignores every visitor's
  // stored preference.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
