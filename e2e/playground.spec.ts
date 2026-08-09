import { expect, test } from "@playwright/test";

/**
 * The snake board is played, not scrolled.
 *
 * It was fifteen flex rows of fixed 16px cells inside a horizontally scrolling
 * container, so a phone player had to scroll sideways to see the wall they
 * were about to hit. It is now one fractional-track grid that scales to the
 * viewport.
 *
 * The cell *count* is fixed at every width deliberately — a board that changed
 * shape on a phone would be a different game, and the best score is a single
 * number shared across both — so the count is asserted, not the pixel size.
 */

const COLUMNS = 30;
const ROWS = 15;

const board = (page: import("@playwright/test").Page) =>
  page.getByRole("application", { name: /snake game board/i });

test("the board fits the viewport at every width", async ({ page }) => {
  await page.goto("/");
  const el = board(page);
  await el.scrollIntoViewIfNeeded();

  const box = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const wrapper = node.parentElement!;
    return {
      cells: node.children.length,
      left: r.left,
      right: r.right,
      viewport: document.documentElement.clientWidth,
      wrapperScrolls: wrapper.scrollWidth > wrapper.clientWidth + 1,
    };
  });

  expect(box.cells).toBe(ROWS * COLUMNS);
  expect(box.right).toBeLessThanOrEqual(box.viewport + 1);
  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.wrapperScrolls, "the board still scrolls sideways").toBe(false);
});

test("the cells stay square", async ({ page }) => {
  await page.goto("/");
  const el = board(page);
  await el.scrollIntoViewIfNeeded();

  const cell = await el.evaluate((node) => {
    const r = node.firstElementChild!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });

  // Sub-pixel tolerance: fractional tracks rarely divide evenly.
  expect(Math.abs(cell.w - cell.h)).toBeLessThan(1.5);
  expect(cell.w).toBeGreaterThan(0);
});

test("nothing moves until the game is started", async ({ page }) => {
  await page.goto("/");
  const el = board(page);
  await el.scrollIntoViewIfNeeded();

  // A board that ran on scroll would be continuous unrequested motion in the
  // middle of a page; one that waits for a press is motion the visitor chose,
  // which is what makes it safe under reduced motion without special-casing.
  const headAt = () =>
    el.evaluate((node) =>
      [...node.children].findIndex((c) =>
        c.className.includes("border-accent bg-accent"),
      ),
    );

  const before = await headAt();
  await page.waitForTimeout(1200);
  expect(await headAt()).toBe(before);
});

test("it plays, and steering changes direction", async ({ page }) => {
  await page.goto("/");
  const el = board(page);
  await el.scrollIntoViewIfNeeded();

  const head = async () => {
    const index = await el.evaluate((node) =>
      [...node.children].findIndex((c) =>
        c.className.includes("border-accent bg-accent"),
      ),
    );
    return { x: index % COLUMNS, y: Math.floor(index / COLUMNS) };
  };

  const start = await head();
  await page.getByRole("button", { name: /^start/i }).first().click();

  // Moving at all proves the flattened index -> (x, y) mapping still matches
  // the game logic after the grid rebuild.
  await expect
    .poll(async () => (await head()).x, { timeout: 10_000 })
    .toBeGreaterThan(start.x);

  const beforeTurn = await head();
  await el.focus();
  await page.keyboard.press("ArrowUp");

  await expect
    .poll(async () => (await head()).y, { timeout: 10_000 })
    .toBeLessThan(beforeTurn.y);
});
