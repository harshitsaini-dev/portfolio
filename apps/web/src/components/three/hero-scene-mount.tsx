"use client";

/**
 * Decides whether the 3D scene runs at all, and loads it only if so.
 *
 * Separate from the scene itself because this file must stay tiny: it is in
 * the initial bundle, and the whole point is that Three.js is not. Everything
 * expensive lives behind the dynamic import below and is fetched only after
 * every gate has been passed.
 *
 * ## Four gates, in order of cost
 *
 *   1. **The CMS.** `scene_settings.is_enabled` defaults to off. A portfolio
 *      with no 3D is the shipped default, not a fallback.
 *   2. **Reduced motion.** A visitor who asked for less motion gets no
 *      canvas at all, not a still one — a WebGL context is a real cost for
 *      something they did not ask to see.
 *   3. **Small screens.** `is_mobile_enabled` defaults to off. The device
 *      most likely to be on a battery and a slow connection is the one least
 *      likely to benefit.
 *   4. **WebGL.** Probed rather than assumed. A context can fail on a
 *      machine that "supports" WebGL — blocklisted drivers, an exhausted
 *      context pool, a browser with it disabled.
 *
 * The decision is read through `useSyncExternalStore`, which is the React API
 * for exactly this: a value that exists only in the browser, with an explicit
 * server snapshot so hydration cannot mismatch. An effect plus `setState`
 * would have worked and is what this started as, but it re-renders after
 * mount for a value that never changes — and the lint rule that flags it is
 * right to.
 *
 * The snapshot is cached at module scope because `useSyncExternalStore`
 * compares snapshots with `Object.is`: returning a fresh object each call
 * would loop forever.
 *
 * ## Why the probe is disposed
 *
 * Browsers cap live WebGL contexts, around 8–16, and dropping one without
 * calling `loseContext()` leaves it live until GC. A probe that leaked would
 * eventually be the reason the real canvas could not be created.
 */

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import type { SceneQuality } from "./hero-scene";

/**
 * `ssr: false` is required, not a preference: a WebGL canvas cannot be
 * server-rendered, and attempting it makes the whole page fail rather than
 * the scene.
 */
const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

export interface SceneConfig {
  readonly isEnabled: boolean;
  readonly isMobileEnabled: boolean;
  readonly maxPixelRatio: number;
}

/** Below this width the device is treated as small. */
const SMALL_SCREEN_PX = 768;

/**
 * Whether a WebGL context can actually be created.
 *
 * Creates one, checks it, then explicitly loses it. See the module comment
 * for why the disposal matters.
 */
function canRenderWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Run the gates once. Returns null when the scene must not render. */
function decide(config: SceneConfig): SceneQuality | null {
  if (!config.isEnabled) return null;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

  const isSmallScreen = window.innerWidth < SMALL_SCREEN_PX;
  if (isSmallScreen && !config.isMobileEnabled) return null;

  if (!canRenderWebGL()) return null;

  return {
    // Small screens get a lower ceiling even when explicitly enabled: the
    // setting says "allowed here", not "render at full resolution here".
    maxPixelRatio: isSmallScreen
      ? Math.min(config.maxPixelRatio, 1.5)
      : config.maxPixelRatio,
    animate: true,
  };
}

/**
 * The cached decision.
 *
 * Module scope rather than a ref: `useSyncExternalStore` calls `getSnapshot`
 * during render and compares the result with `Object.is`, so it has to be the
 * same object every time or React re-renders forever.
 */
let cached: { config: SceneConfig; value: SceneQuality | null } | null = null;

/** Nothing changes after mount, so there is nothing to subscribe to. */
const subscribe = () => () => {};

export function HeroSceneMount({ config }: { config: SceneConfig }) {
  const decision = useSyncExternalStore(
    subscribe,
    () => {
      // Recompute only if the settings themselves changed, which happens when
      // the CMS is edited and the page re-renders with new props.
      if (
        !cached ||
        cached.config.isEnabled !== config.isEnabled ||
        cached.config.isMobileEnabled !== config.isMobileEnabled ||
        cached.config.maxPixelRatio !== config.maxPixelRatio
      ) {
        cached = { config, value: decide(config) };
      }
      return cached.value;
    },
    // The server has no window, no media query and no WebGL. It renders
    // nothing, and so does the first client render, so hydration agrees.
    () => null,
  );

  if (!decision) return null;
  return <HeroScene quality={decision} />;
}
