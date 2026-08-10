"use client";

/**
 * The hero's 3D layer.
 *
 * ## It is decoration, and the markup says so
 *
 * `aria-hidden` and `pointer-events-none`, sitting *behind* the hero text.
 * Nothing here is a control, nothing here is content, and removing it changes
 * nothing a visitor can read or do. That is the project's rule for 3D and it
 * is enforced by construction rather than by intention: there is no way to
 * reach a heading, a link or an action through this canvas, because it
 * contains none.
 *
 * ## Nothing here blocks the hero
 *
 * This module is loaded dynamically by `HeroSceneMount`, so Three.js is not
 * in the page's initial JavaScript at all. The name, role and calls to action
 * are server-rendered HTML that never waits for a canvas.
 *
 * ## Modelled in code, not loaded
 *
 * The figure is composed from rounded boxes and spheres — see `robot.tsx`. A
 * GLB would look better and is the right answer for a hero character
 * eventually, but there is no asset, no licence for one, and no pipeline that
 * budgets, compresses and serves it. That pipeline is what Phase 14 is for.
 */

import { Canvas } from "@react-three/fiber";

import { Robot } from "./robot";
import { silenceKnownThreeWarning } from "./silence-known-three-warning";

/*
  Installed at module scope, which runs before the first `<Canvas>` mounts and
  therefore before fiber constructs the `THREE.Clock` that warns. An effect
  would be too late — the store is built during render.

  This module is only ever imported by the lazy scene mount, so a visitor who
  never gets a 3D scene never loads it either.
*/
silenceKnownThreeWarning();

export interface SceneQuality {
  /** Upper bound on device pixel ratio. Higher costs fill rate, not detail. */
  readonly maxPixelRatio: number;
  /** When false, the scene renders once and never animates. */
  readonly animate: boolean;
}

export default function HeroScene({ quality }: { quality: SceneQuality }) {
  return (
    <div
      aria-hidden="true"
      /*
        `fixed`, covering the viewport, behind everything.
        
        It was `absolute inset-0` inside the hero section at first, which
        bounded the figure to the hero: scrolling moved it down until it hit
        the section edge and vanished. Reported as "the robot stays at the
        top". A fixed layer lets it accompany the visitor down the page, which
        is the point.
        
        `-z-10` and `pointer-events-none` keep it behind and inert, so it
        never intercepts a click or covers text.
        
        Hidden below `sm`: the hero stacks there and the figure would sit on
        top of the text rather than beside it. Small screens are also gated
        separately in the CMS; this is the layout half of that.
      */
      className="pointer-events-none fixed inset-0 -z-10 hidden sm:block"
    >
      <Canvas
        // Clamped rather than trusted: a 3x-DPR phone renders nine times the
        // pixels of a 1x one for a difference nobody sees on a soft shape.
        dpr={[1, quality.maxPixelRatio]}
        camera={{ position: [0, 0, 5], fov: 45 }}
        // `alpha` so the page background shows through; the canvas tints the
        // hero rather than replacing it.
        gl={{ antialias: true, alpha: true }}
        // Stop the loop when the tab is hidden. Without this a background tab
        // keeps rendering, which is the single most common 3D battery bug.
        frameloop={quality.animate ? "always" : "demand"}
      >
        {/*
          Three lights, which is the minimum that gives a solid shape any
          form: a fill so nothing is black, a key for shape, and a rim from
          behind so the silhouette separates from the page background.
        */}
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 4, 5]} intensity={1.5} />
        <directionalLight position={[-4, 2, -3]} intensity={0.6} color="#8ea6ff" />
        <Robot animate={quality.animate} />
      </Canvas>
    </div>
  );
}
