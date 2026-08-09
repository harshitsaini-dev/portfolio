/**
 * The visitor's own theme override.
 *
 * Separate from the site's `default_theme`, which the CMS owns and the server
 * renders into `data-theme`. This is one visitor saying "not that one, this
 * one", stored in their browser and applied on top.
 *
 * Both the pre-paint script and the toggle component read this module, so the
 * key and the accepted values are defined once. Two spellings of a
 * `localStorage` key is a bug that only shows up as "my setting did not
 * stick", with nothing to catch it.
 */

export const THEME_STORAGE_KEY = "portfolio-theme";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * The script that applies a stored preference **before the first paint**.
 *
 * ## Why this has to be a string
 *
 * It runs synchronously in `<head>`, ahead of React and ahead of the browser
 * painting anything. No component can do that: by the time React hydrates,
 * the page has already been painted in the CMS's default theme, and a visitor
 * who chose dark would see a white flash on every navigation. This is the one
 * place where inlining a script is the correct answer rather than a shortcut.
 *
 * ## Why it is safe
 *
 * It interpolates **nothing**. The only value that reaches it is the storage
 * key, a constant defined above, and the only thing it writes to the DOM is
 * one of two hard-coded strings after an explicit equality check. There is no
 * path from stored data to executed code: a tampered `localStorage` value
 * that is neither "light" nor "dark" falls through and removes the attribute.
 *
 * It is wrapped in try/catch because `localStorage` access throws outright in
 * some privacy modes, and a script that throws in `<head>` would take the
 * rest of the document's head scripts with it.
 */
/**
 * A tiny store over the stored choice, for `useSyncExternalStore`.
 *
 * The obvious implementation is `useState` plus an effect that reads storage
 * on mount, and this project's lint config rejects it — rightly: it renders
 * once with a placeholder and then again with the real value, for something
 * that was knowable the moment the component reached the browser.
 *
 * Modelling it as an external store says what is actually true. The theme
 * choice is not component state; it is a fact about the browser that React is
 * reading. That framing also buys two things for free:
 *
 *   * **Other tabs.** The `storage` event fires in every other tab when one of
 *     them writes, so changing the theme in one updates the rest.
 *   * **An explicit server snapshot**, so hydration cannot mismatch.
 *
 * The snapshot is cached because `useSyncExternalStore` compares snapshots
 * with `Object.is` and re-renders whenever they differ. Reading storage fresh
 * on every call returns an equal string, which is fine — but caching keeps the
 * read off the render path and makes the invalidation points explicit.
 */
let cached: ThemeChoice | null = null;
const listeners = new Set<() => void>();

function readStorage(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // Access throws outright in some privacy modes. A visitor who cannot
    // store a preference should still get a working control for this page.
  }
  return "system";
}

function emit(): void {
  cached = null;
  for (const listener of listeners) listener();
}

export function subscribeToThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  // Fires in *other* tabs when one writes, never in the tab that wrote — which
  // is why `applyThemeChoice` notifies locally as well.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeChoice(): ThemeChoice {
  if (cached === null) cached = readStorage();
  return cached;
}

/**
 * The server's answer: `system`.
 *
 * Safe rather than a guess. `system` is the only choice that writes no
 * attribute, so the markup React produces while hydrating agrees with the
 * document whatever the pre-paint script already did to it.
 */
export function getServerThemeChoice(): ThemeChoice {
  return "system";
}

/** Writes the choice to the document and to storage, then notifies readers. */
export function applyThemeChoice(next: ThemeChoice): void {
  const root = document.documentElement;
  if (next === "system") {
    // Removed, not set to "system". No rule matches that value, so writing it
    // would leave `prefers-color-scheme` in charge while looking like an
    // explicit choice — and `data-theme` is the hook the tokens use to
    // override the media query.
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", next);
  }

  try {
    if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Persistence is a convenience. Failing to store must not stop the theme
    // changing for this page view.
  }

  emit();
}

export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (v === "light" || v === "dark") {
      document.documentElement.setAttribute("data-theme", v);
    } else if (v === "system") {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch (e) {}
})();
`;
