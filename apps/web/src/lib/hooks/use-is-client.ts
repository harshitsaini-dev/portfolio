"use client";

/**
 * `false` on the server and during hydration, `true` once running in the
 * browser.
 *
 * The point is progressive enhancement: a component can server-render the
 * plain, always-works markup and only switch to the interactive version once
 * it knows JavaScript is running. A visitor whose script fails, or who is on a
 * browser that never runs it, keeps the plain version rather than a shell that
 * depends on a mechanism that did not arrive.
 *
 * `useSyncExternalStore` rather than `useState(false)` plus an effect. Both
 * work, but this one states the intent — the value is a fact about the
 * environment, not component state — and it avoids the `setState` in an effect
 * that this project's lint config rejects. `subscribe` is a no-op because the
 * answer never changes after mount.
 */

import { useSyncExternalStore } from "react";

/** Never fires: nothing can make this value change once it is true. */
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
