"use client";

/**
 * Whether the visitor has asked for reduced motion.
 *
 * Read through `useSyncExternalStore`, which is the React API for a value
 * that exists only in the browser: it takes an explicit server snapshot, so
 * hydration cannot mismatch, and it subscribes to changes so a visitor who
 * flips the setting is respected without a reload.
 *
 * The obvious alternative — `useState(false)` plus an effect that calls
 * `setState` — works but re-renders after mount for a value that is known
 * immediately, and the lint rule that flags it is right to. Reading
 * `matchMedia` during render is not an option either: the server has no
 * `window`.
 *
 * The server snapshot is `false`, meaning "assume motion is fine". That is
 * the safer default in this direction: components use this to *disable*
 * effects, so the first paint matches the markup either way, and the correct
 * answer arrives before anything animates.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
