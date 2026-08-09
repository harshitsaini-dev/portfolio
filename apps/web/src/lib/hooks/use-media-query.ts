"use client";

/**
 * Whether a CSS media query currently matches.
 *
 * For the case where a component's *behaviour* has to agree with a breakpoint
 * its CSS already uses. Styling alone is better done in CSS; this exists for
 * when JavaScript would otherwise contradict it.
 *
 * The projects carousel is exactly that case, and it was a real bug before
 * this existed: the CSS declined to stack the cards below the tablet
 * breakpoint, but the component still marked every non-active card `inert`.
 * On a phone that left four visible cards of which three had dead links and
 * were skipped by screen readers — content present but unreachable, which is
 * worse than either arrangement on its own.
 *
 * `useSyncExternalStore` rather than state plus an effect: it subscribes to
 * the change event, so a resize or an orientation change is respected, and it
 * takes an explicit server snapshot so hydration cannot mismatch.
 *
 * The server snapshot is `false`. That is the deliberate direction: callers
 * use this to *enable* an enhancement, so the server renders the plain version
 * and the browser upgrades it. Guessing `true` would server-render an
 * arrangement that a narrow browser then has to undo.
 */

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
