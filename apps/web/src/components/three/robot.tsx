"use client";

/**
 * A small robot, built from primitives.
 *
 * ## Why it is modelled in code rather than loaded
 *
 * A GLB would look better and would be the right answer for a hero character.
 * It is not the right answer *yet*: there is no asset, no licence for one, and
 * no pipeline that budgets, compresses and serves it — that pipeline is the
 * point of Phase 14. Composing rounded boxes and spheres gives a figure with
 * no download, no licensing question and no texture memory, and it is honest
 * about being stylised rather than pretending to be a model.
 *
 * ## It is decoration
 *
 * Rendered inside the hero's `aria-hidden`, `pointer-events-none` layer. It
 * carries no information, and the page reads identically with it removed.
 *
 * ## Motion
 *
 * A slow bob, a slight sway, a head that turns toward the pointer, a blink,
 * and a wave every few seconds. The continuous parts are small on purpose: a
 * figure that lunges at the cursor pulls the eye away from the name beside
 * it, which is the one thing the hero exists to show.
 *
 * The wave is a *cycle* rather than a loop — arm down most of the time,
 * raised for a couple of seconds now and then. A figure waving continuously
 * stops reading as a greeting and starts reading as a stuck animation.
 *
 * Scrolling walks it down and slightly inward, so it reads as showing the
 * visitor into the page rather than staying pinned to a corner while
 * everything around it moves.
 *
 * Everything is framerate-independent and damped, so nothing snaps: the
 * damping uses `1 - exp(-k·dt)` rather than the usual fixed fraction per
 * frame, which would move faster on a 120Hz display than a 60Hz one.
 */

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group, Mesh } from "three";

/**
 * Shoulder pivot.
 *
 * Arrived at by measurement, after overshooting in both directions:
 *
 *   * At 0.78 the arm floated, with a visible gap at the joint — its inner
 *     edge sat at 0.65 against a torso edge of 0.575.
 *   * At 0.64 it was buried, the inner edge at 0.51 sinking 0.065 *into* the
 *     torso.
 *
 * 0.705 is torso half-width (0.575) plus arm half-width (0.13), so the arm
 * sits flush against the side rather than inside it. The shoulder sphere,
 * radius 0.17, spans the seam and is what makes the joint read as a joint.
 */
const SHOULDER_X = 0.705;
const SHOULDER_Y = 0.34;

/**
 * Resting position and size, in scene units.
 *
 * Sized against the visible frame rather than by eye. With the camera at
 * z = 5 and a 45 degree field of view the viewport is 2 * 5 * tan(22.5) =
 * 4.14 units tall and, at 16:10, about 6.6 wide — so x spans roughly ±3.3.
 *
 * Both extremes were tried and neither worked. At 0.86 the figure filled some
 * 60% of the screen height once the canvas became full-viewport. At 0.45 it
 * was a speck. 0.62 puts it near 40%, which is present without dominating.
 *
 * The gap it used to sit in closed when the portrait became a large tilted
 * panel, so it moved down and left and got smaller: it is a companion at the
 * foot of the composition now rather than a second focal point competing
 * with the photograph. Positions were checked against the rendered hero
 * rather than reasoned about — every previous guess was wrong in one
 * direction or the other.
 *
 * `y` is negative because the group's origin is at the torso, not the centre
 * of the figure: the head reaches roughly 1.0 units above it at this scale.
 * Resting at +0.1 with a sway of 0.85 put the top of the head at about 1.96
 * against a frame half-height of 2.07 — close enough that the idle bob
 * clipped it. Sitting lower with a smaller sway keeps the whole figure in
 * frame at every scroll position.
 */
const ROBOT_HOME_X = 2.5;
const ROBOT_HOME_Y = -0.9;
const ROBOT_SCALE = 0.42;

/**
 * The figure never crosses to the left of this.
 *
 * The canvas is fixed behind the whole page, so an unconstrained drift walked
 * it straight through the middle of the skills cards — the surfaces are
 * semi-transparent, so it showed through and made the text harder to read.
 * Decoration that costs legibility has stopped being decoration.
 *
 * The content column ends around x = 1.6 in scene units at desktop widths, so
 * staying right of 1.9 keeps the figure in the margin.
 */
const ROBOT_MIN_X = 1.9;

/**
 * How far it travels as the page scrolls.
 *
 * The first version drifted monotonically down and outward, so it only ever
 * moved one way — reported as exactly that. Driving both axes with sines of
 * the scroll progress makes it wander back and forth instead, which reads as
 * a companion moving around rather than an object sliding off the screen.
 */
const SCROLL_SWAY_X = 0.75;
const SCROLL_SWAY_Y = 0.55;

/**
 * How far it travels toward and away from the camera.
 *
 * Bounded well short of the camera at z = 5: crossing the near plane would
 * clip the figure through the screen, and even approaching it makes the
 * perspective distort unpleasantly.
 */
const SCROLL_DEPTH = 1.3;

/** How often the robot waves, and for how long, in seconds. */
const WAVE_CYCLE_SECONDS = 8;
const WAVE_DURATION_SECONDS = 2.4;

/**
 * Arm rotation about z: the resting angle, and the offset the wave adds.
 *
 * Both values are **negative for the left arm**, and the right arm negates
 * them. The arm hangs along -Y, and rotating (0,-1) by +θ about Z gives
 * (sin θ, -cos θ) — so a positive angle swings the *left* arm inward, across
 * the front of the torso, and a negative one swings it outward.
 *
 * The rest angle was +0.18 at first, which tucked both arms into the body and
 * made them clip through it. Leaning each arm slightly outward instead keeps
 * them clear of the torso at rest, which is also how arms hang.
 */
const ARM_REST_ROTATION = -0.1;
const ARM_RAISED_ROTATION = -2.25;

/** The palette, kept in step with the design tokens by hand. */
const SHELL = "#e8eaf2";
const SHELL_DARK = "#aeb4c7";
const ACCENT = "#2547d0";
/** The hoodie. Dark enough to read as fabric beside the pale shell. */
const HOODIE = "#1c2030";
const HOODIE_LIGHT = "#2a3045";

export function Robot({ animate }: { animate: boolean }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);
  const wavingArm = useRef<Group>(null);

  /**
   * Cursor position, normalised to -1..1 with the origin at the viewport
   * centre — the same convention `state.pointer` uses, so the maths below is
   * unchanged.
   *
   * A ref rather than state: this updates on every mouse move and is only
   * ever read inside the render loop. Putting it in state would re-render the
   * component hundreds of times a second to produce identical JSX.
   */
  const pointer = useRef({ x: 0, y: 0 });

  /**
   * How far the hero has been scrolled past, 0 to 1.
   *
   * Drives the robot downward as the visitor scrolls, so it reads as showing
   * them into the page rather than staying pinned to a corner while
   * everything else moves.
   */
  const scrollProgress = useRef(0);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      // Negated so +1 is the TOP of the viewport.
      //
      // Screen coordinates put y=0 at the top and grow downward; the scene's
      // normalised device coordinates put +1 at the top. Without this flip the
      // head looked down when the cursor moved up — reported, and it is the
      // sign that was wrong rather than the formula that reads it.
      pointer.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    const onScroll = () => {
      // Measured across the whole document now that the canvas is fixed to
      // the viewport: the figure accompanies the visitor for the length of
      // the page rather than only through the hero.
      const scrollable = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      );
      const progress = window.scrollY / scrollable;
      scrollProgress.current = Math.min(Math.max(progress, 0), 1);
    };

    // `passive` on both: neither calls preventDefault, and saying so lets the
    // browser scroll without waiting on the handler.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useFrame((state, delta) => {
    if (!animate) return;
    const time = state.clock.elapsedTime;

    if (root.current) {
      // A slow bob, plus a descent driven by scroll. The bob is added to the
      // scrolled position rather than replacing it, so the figure keeps
      // breathing while it moves.
      const bob = Math.sin(time * 0.9) * 0.06;
      const scroll = scrollProgress.current;

      // Both axes wander rather than sliding one way. The frequencies differ
      // so the two do not trace a straight diagonal, and the figure never
      // crosses into the text column on the left.
      const targetY =
        ROBOT_HOME_Y + bob + Math.sin(scroll * Math.PI * 2) * SCROLL_SWAY_Y;
      const targetX = Math.max(
        ROBOT_MIN_X,
        ROBOT_HOME_X + Math.sin(scroll * Math.PI * 3) * SCROLL_SWAY_X,
      );

      // Depth, so the figure appears to move toward and away from the
      // viewer. Driven by moving it along Z rather than by scaling it: with a
      // perspective camera, distance changes apparent size *and* parallax,
      // and scaling only changes size — which reads as an object growing
      // rather than approaching.
      const targetZ =
        Math.sin(scroll * Math.PI * 2.5) * SCROLL_DEPTH +
        Math.sin(time * 0.45) * 0.25;

      // Eased, not tracked. A figure pinned rigidly to scroll position reads
      // as a scrollbar; one that lags behind reads as company.
      const k = 1 - Math.exp(-3 * delta);
      root.current.position.y += (targetY - root.current.position.y) * k;
      root.current.position.x += (targetX - root.current.position.x) * k;
      root.current.position.z += (targetZ - root.current.position.z) * k;

      root.current.rotation.z = Math.sin(time * 0.6) * 0.03;
    }

    if (head.current) {
      // Read from the window-level tracker, not `state.pointer`.
      //
      // The canvas sits under `pointer-events-none` so it never intercepts a
      // click meant for the page — which also means R3F receives no pointer
      // events at all and `state.pointer` stays at the origin. Measured: the
      // head did not move. Tracking on `window` keeps the canvas inert and
      // still knows where the cursor is.
      const targetY = pointer.current.x * 0.5;
      const targetX = -pointer.current.y * 0.28;
      // Damped toward the target rather than assigned. `1 - exp(-k*dt)` is
      // framerate-independent, unlike the usual `+= (target - current) * 0.1`,
      // which moves faster on a 120Hz display.
      const k = 1 - Math.exp(-4 * delta);
      head.current.rotation.y += (targetY - head.current.rotation.y) * k;
      head.current.rotation.x += (targetX - head.current.rotation.x) * k;
    }

    // A blink: eyes squash briefly, on an interval rather than every frame.
    const blink = Math.sin(time * 0.7) > 0.995 ? 0.15 : 1;
    if (leftEye.current) leftEye.current.scale.y = blink;
    if (rightEye.current) rightEye.current.scale.y = blink;

    // The wave.
    //
    // A cycle rather than a loop: the arm is down most of the time and waves
    // for a couple of seconds now and then. A figure waving continuously
    // stops reading as a greeting and starts reading as a stuck animation.
    if (wavingArm.current) {
      const phase = time % WAVE_CYCLE_SECONDS;
      let target = ARM_REST_ROTATION;

      if (phase < WAVE_DURATION_SECONDS) {
        // Ease the arm up and back down across the window, so it never snaps
        // between resting and raised.
        const progress = phase / WAVE_DURATION_SECONDS;
        const lift = Math.sin(progress * Math.PI);
        // The side-to-side motion only happens while the arm is actually up,
        // scaled by the same lift so it starts and ends at zero rather than
        // jerking as the arm passes through.
        const swing = Math.sin(phase * 9) * 0.3 * lift;
        target = ARM_REST_ROTATION + lift * ARM_RAISED_ROTATION + swing;
      }

      const k = 1 - Math.exp(-8 * delta);
      wavingArm.current.rotation.z +=
        (target - wavingArm.current.rotation.z) * k;
    }
  });

  return (
    <group ref={root} position={[ROBOT_HOME_X, ROBOT_HOME_Y, 0]} scale={ROBOT_SCALE}>
      {/* Head */}
      <group ref={head} position={[0, 1.15, 0]}>
        {/*
          A rounded box with a large radius rather than a sphere or a hard
          box: a sphere reads as a ball and a box read as a crate. This keeps
          a flat-ish front to sit features on while staying soft.
        */}
        <RoundedBox args={[1.1, 1.05, 1.0]} radius={0.34} smoothness={5}>
          <meshStandardMaterial color={SHELL} roughness={0.35} metalness={0.12} />
        </RoundedBox>

        {/*
          The hood: a sphere slightly larger than the head, pushed back so the
          face stays clear. Cheaper and more legible than a modelled shell,
          and it reads as a hoodie immediately.
        */}
        <mesh position={[0, 0.06, -0.16]} scale={[1.06, 1.02, 1]}>
          <sphereGeometry args={[0.72, 28, 24]} />
          <meshStandardMaterial color={HOODIE} roughness={0.85} metalness={0.02} />
        </mesh>

        {/* The rim, where the fabric turns back around the face. */}
        <mesh position={[0, 0.05, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.58, 0.1, 14, 32]} />
          <meshStandardMaterial
            color={HOODIE_LIGHT}
            roughness={0.85}
            metalness={0.02}
          />
        </mesh>

        {/*
          A face rather than a visor band: two eyes and a mouth, each proud of
          the head. `emissive` because nothing in the scene lights the front
          of a face held inside a hood.
        */}
        <mesh ref={leftEye} position={[-0.2, 0.1, 0.5]}>
          <sphereGeometry args={[0.085, 20, 20]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={rightEye} position={[0.2, 0.1, 0.5]}>
          <sphereGeometry args={[0.085, 20, 20]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>

        {/* A small bar for a mouth. Enough to read as a face without tipping
            into a cartoon. */}
        <RoundedBox
          args={[0.26, 0.055, 0.05]}
          radius={0.025}
          smoothness={3}
          position={[0, -0.16, 0.5]}
        >
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </RoundedBox>

        {/* Antenna */}
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.3, 10]} />
          <meshStandardMaterial color={SHELL_DARK} roughness={0.4} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.82, 0]}>
          <sphereGeometry args={[0.085, 18, 18]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Neck */}
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.22, 16]} />
        <meshStandardMaterial color={SHELL_DARK} roughness={0.4} metalness={0.35} />
      </mesh>

      {/* Torso, wearing the hoodie. */}
      <RoundedBox args={[1.15, 1.05, 0.72]} radius={0.2} smoothness={4}>
        <meshStandardMaterial color={HOODIE} roughness={0.85} metalness={0.02} />
      </RoundedBox>

      {/* The front pocket. */}
      <RoundedBox
        args={[0.72, 0.32, 0.06]}
        radius={0.05}
        smoothness={3}
        position={[0, -0.24, 0.36]}
      >
        <meshStandardMaterial
          color={HOODIE_LIGHT}
          roughness={0.85}
          metalness={0.02}
        />
      </RoundedBox>

      {/* Drawstrings: two short cords with tips, hanging from the hood. */}
      {[-0.14, 0.14].map((x) => (
        <group key={x} position={[x, 0.42, 0.33]}>
          <mesh>
            <cylinderGeometry args={[0.018, 0.018, 0.28, 8]} />
            <meshStandardMaterial color={SHELL_DARK} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.16, 0]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial color={SHELL} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Chest light, sitting on fabric rather than a metal plate. */}
      <mesh position={[0, 0.14, 0.37]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 24]} />
        <meshStandardMaterial
          color={ACCENT}
          emissive={ACCENT}
          emissiveIntensity={0.9}
          toneMapped={false}
        />
      </mesh>

      {/*
        Arms.
        
        Each is a group whose origin sits at the shoulder, so rotating it
        swings the whole arm rather than spinning it about its middle. The
        left one waves; the right hangs.
      */}
      <group
        ref={wavingArm}
        position={[-SHOULDER_X, SHOULDER_Y, 0]}
        rotation={[0, 0, ARM_REST_ROTATION]}
      >
        {/* The joint itself. A sphere at the pivot fills the wedge that opens
            between a rotating box and a flat torso side — without it the arm
            visibly detaches as soon as it swings. */}
        <mesh>
          <sphereGeometry args={[0.17, 20, 20]} />
          <meshStandardMaterial color={SHELL_DARK} roughness={0.4} metalness={0.35} />
        </mesh>
        <RoundedBox
          args={[0.26, 0.72, 0.26]}
          radius={0.1}
          smoothness={3}
          position={[0, -0.3, 0]}
        >
          <meshStandardMaterial color={HOODIE} roughness={0.85} metalness={0.02} />
        </RoundedBox>
        <mesh position={[0, -0.76, 0]}>
          <sphereGeometry args={[0.15, 18, 18]} />
          <meshStandardMaterial color={SHELL} roughness={0.35} metalness={0.2} />
        </mesh>
      </group>

      <group position={[SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, -ARM_REST_ROTATION]}>
        <mesh>
          <sphereGeometry args={[0.17, 20, 20]} />
          <meshStandardMaterial color={SHELL_DARK} roughness={0.4} metalness={0.35} />
        </mesh>
        <RoundedBox
          args={[0.26, 0.72, 0.26]}
          radius={0.1}
          smoothness={3}
          position={[0, -0.3, 0]}
        >
          <meshStandardMaterial color={HOODIE} roughness={0.85} metalness={0.02} />
        </RoundedBox>
        <mesh position={[0, -0.76, 0]}>
          <sphereGeometry args={[0.15, 18, 18]} />
          <meshStandardMaterial color={SHELL} roughness={0.35} metalness={0.2} />
        </mesh>
      </group>
    </group>
  );
}
