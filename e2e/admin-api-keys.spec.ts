import { expect, test } from "@playwright/test";

/**
 * The API keys page, end to end: a key created in the browser works against
 * the real API, is shown exactly once, and stops working the moment it is
 * revoked in the browser.
 *
 * Runs against the admin's `next dev` (see `playwright.config.ts`), which
 * reads the local development D1 — so migration 0020 must be applied locally.
 * Each run names its key uniquely and deletes it at the end.
 */

const ADMIN = "http://localhost:3001";

test("the OpenAPI document is public and lists the API", async ({ request }) => {
  const response = await request.get(`${ADMIN}/api/v1/openapi.json`);
  expect(response.status()).toBe(200);
  const document = await response.json();
  expect(document.openapi).toBe("3.0.3");
  expect(Object.keys(document.paths)).toContain("/projects");
  expect(Object.keys(document.paths)).toContain("/me");
});

test("an API call without a key is refused", async ({ request }) => {
  const response = await request.get(`${ADMIN}/api/v1/projects`);
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain("Bearer");
});

test("a key created in the admin works until it is revoked", async ({ page, request }, testInfo) => {
  const name = `e2e ${testInfo.project.name} ${Date.now()}`;

  await page.goto(`${ADMIN}/api-keys`);
  await expect(page.getByRole("heading", { level: 1, name: "API keys" })).toBeVisible();

  await page.getByRole("textbox", { name: /Name/ }).fill(name);
  await page.getByRole("checkbox", { name: /^Write/ }).check();
  await page.getByRole("button", { name: "Create key" }).click();

  const keyField = page.getByLabel("The new API key");
  await expect(keyField).toBeVisible();
  await expect(page.getByRole("status")).toContainText("cannot be shown again");
  const key = await keyField.inputValue();
  expect(key).toMatch(/^pfk_[A-Za-z0-9_-]{43}$/);

  const me = await request.get(`${ADMIN}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } });
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.data.name).toBe(name);
  expect(body.data.scopes).toEqual(["read", "write"]);

  // Dismissing the panel, or reloading, never shows the key again.
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(page.getByLabel("The new API key")).toHaveCount(0);
  expect(await page.content()).not.toContain(key);

  // Keyboard: the revoke control is reachable and labelled with the key's name.
  const revoke = page.getByRole("button", { name: `Revoke ${name}` });
  await revoke.focus();
  await expect(revoke).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: `Yes, revoke ${name}` }).click();
  await expect(page).toHaveURL(/revoked=1/);

  const after = await request.get(`${ADMIN}/api/v1/me`, { headers: { authorization: `Bearer ${key}` } });
  expect(after.status()).toBe(401);

  // Clean up: a revoked key can be deleted.
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: `Yes, delete ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
