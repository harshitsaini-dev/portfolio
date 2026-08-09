"use client";

/**
 * A hooded robot, composed from primitives.
 *
 * ## Built rather than loaded, and why the proportions are the whole job
 *
 * A supplied glTF model was wired up earlier and removed at the owner's
 * request. What replaced it is geometry, and with geometry the only thing
 * that decides whether it reads as a character is the ratios:
 *
 *   * The **hood is wider than the body** (1.56 against 1.16) and nearly as
 *     tall as the torso and legs together. That is what "chibi" means, and no
 *     amount of surface detail substitutes for it.
 *   * The **face is a dark plate with two tall glowing slots**, not round
 *     eyes and not a smile. That single choice is most of what makes the
 *     reference read as a machine wearing clothes rather than a mascot.
 *   * **Limbs are short and thick.** Thin limbs under a large head look like
 *     a spider; short ones look like a toy.
 *
 * The previous version failed on all three: a spherical hood swallowed the
 * head, the shoulder joints sat level with the face so the arms appeared to
 * grow out of it, and the pale hands floated free of the sleeves. Rebuilt
 * against a screenshot rather than from memory.
 *
 * ## A single coordinate system
 *
 * The group's origin is the **torso centre**, and every part is placed from
 * it. The last version drifted because parts were nudged one at a time until
 * each looked right alone. The figure spans roughly y -1.5 to +1.8 locally.
 *
 * ## Why it needs so much light
 *
 * `meshStandardMaterial` is physically based and expects an environment to
 * reflect; with none it renders nearly black whatever colour it is given. The
 * scene lights it brightly rather than loading an HDR environment, because
 * drei fetches those from a CDN and a lighting problem is not worth a
 * third-party request on every page load.
 *
 * ## It is decoration
 *
 * Rendered inside the scene's `aria-hidden`, `pointer-events-none` layer. It
 * carries no information and the page reads identically without it.
 */

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Group, type Mesh } from "three";

/**
 * Scratch vector for projecting the figure to screen space.
 *
 * Module scope so the frame loop allocates nothing: a `new Vector3()` per
 * frame is 60 short-lived objects a second, which is exactly the shape of
 * garbage that shows up as periodic stutter rather than as a slow frame.
 */
const projected = new Vector3();

/** Palette. Kept in step with the design tokens by hand. */
const HOODIE = "#dfe3ee";
const HOODIE_SHADE = "#b3bacf";
const VISOR = "#11131b";
const ACCENT = "#8ea6ff";
const SHOE = "#f2f4f8";
const SHORTS = "#39405a";
const METAL = "#9aa2b8";

/** Resting position and size, in scene units. */
const HOME_X = 2.3;
const HOME_Y = -0.35;

/**
 * Scale.
 *
 * The camera sits at z = 5 with a 45 degree field of view, so the viewport is
 * 2 * 5 * tan(22.5) = 4.14 units tall. The figure is about 3.3 units from the
 * soles to the top of the hood, so 0.44 puts it near 35% of the height —
 * present beside the name without competing with it. At 0.5 it dominated the
 * right-hand side of the composition.
 */
const SCALE = 0.44;

/** Never crosses left of this, so it stays clear of the text and the portrait. */
const MIN_X = 1.95;

/** How far it wanders across the length of the page. */
const SWAY_X = 0.55;
const SWAY_Y = 0.5;
const DEPTH = 1.0;

/**
 * How far the figure turns to the left across the length of the page.
 *
 * 0.6 radians is about 34 degrees at the bottom — enough to be unmistakably a
 * turn, and short of the profile view where a face built from a flat plate
 * stops having any features to show.
 */
/**
 * The top of the hood, in local units.
 *
 * The head group sits at y 1.02 and the hood is 1.46 tall, so its crown is at
 * about 1.75. This is the point projected to screen space for the speech
 * bubble to hang from, which is why it is a named constant rather than a
 * number buried in the frame loop: change the hood and this has to change
 * with it.
 */
const HOOD_TOP_Y = 1.78;

const SCROLL_TURN = 0.6;

/**
 * How many half-turns the yaw completes across the page.
 *
 * 2.5 gives left, then right, then left again: `sin` of `scroll * π * 2.5`
 * passes through +1 at a fifth of the way down, -1 at three fifths, and +1
 * again at the end. The owner asked for exactly that sequence, and a sine is
 * the right shape for it because it eases through each reversal instead of
 * snapping — the figure decelerates, holds, and comes back.
 */
const TURN_CYCLES = 2.5;

/** The wave: how often, and for how long, in seconds. */
const WAVE_CYCLE = 9;
const WAVE_DURATION = 2.4;

/**
 * Shoulder pivot, and the geometry that has to agree with it.
 *
 * `SHOULDER_Y` is **below the hood**, not level with it — the previous
 * version put the joints at face height, which is why the arms looked like
 * they came out of the head. The torso's top edge is at +0.5 locally, so 0.16
 * sits the joint just inside the shoulder line.
 *
 * `SHOULDER_X` is torso half-width (0.58) plus arm half-width (0.17), so the
 * arm rests flush against the side rather than inside it. The sphere at the
 * pivot spans the seam and is what makes the joint read as a joint.
 */
const SHOULDER_X = 0.75;
const SHOULDER_Y = 0.16;

/**
 * Arm rotation about Z: the resting angle, and the offset the wave adds.
 *
 * Both are **negative for the left arm**, and the right arm negates them. The
 * arm hangs along -Y, and rotating (0,-1) by +θ gives (sin θ, -cos θ) — so a
 * positive angle swings the *left* arm inward, across the front of the body,
 * and a negative one swings it outward.
 */
const ARM_REST = -0.13;
const ARM_RAISED = -2.35;

export function Robot({ animate }: { animate: boolean }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const wavingArm = useRef<Group>(null);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);

  /** Cursor position, normalised to -1..1 with +1 at the top of the viewport. */
  const pointer = useRef({ x: 0, y: 0 });
  const scrollProgress = useRef(0);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      // Negated: screen coordinates put y = 0 at the top, the scene puts +1
      // there. Without this the head looks down when the cursor goes up.
      pointer.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };

    const onScroll = () => {
      const scrollable = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      );
      scrollProgress.current = Math.min(
        Math.max(window.scrollY / scrollable, 0),
        1,
      );
    };

    // Tracked on `window`, not through R3F. The canvas is `pointer-events-none`
    // so it never intercepts a click meant for the page — which also means it
    // receives no pointer events and `state.pointer` never moves. Measured:
    // the head did not turn until this listener existed.
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
    const scroll = scrollProgress.current;
    // Damped with `1 - exp(-k·dt)` rather than a fixed fraction per frame,
    // which would run faster on a 120Hz display.
    const k = 1 - Math.exp(-3 * delta);

    if (root.current) {
      // Depth rather than scale: with a perspective camera, distance changes
      // apparent size *and* parallax, while scaling only changes size and
      // reads as an object growing rather than approaching.
      const targetZ = Math.sin(scroll * Math.PI * 2.5) * DEPTH;

      /*
        The frame is measured at the figure's own depth, every frame.

        This is the fix for the robot walking off the side of the window as
        the page scrolled, and the cause is worth stating because a fixed
        bound looked obviously sufficient: **moving toward the camera makes
        the visible frame smaller**. At z = 0 the viewport is about 6.6 units
        wide; at z = +1 the camera is only 4 units away instead of 5, so it is
        about 5.3. A figure parked at x = 2.85 is comfortably inside the first
        and outside the second — and `DEPTH` moves it exactly that far
        forward.

        `getCurrentViewport` returns the world-space frame at a given point,
        so the bound tracks depth, viewport size and aspect ratio without this
        component having to know any of them.
      */
      const currentZ = root.current.position.z;
      const frame = state.viewport.getCurrentViewport(state.camera, [
        0,
        0,
        currentZ,
      ]);
      /*
        The figure's own half-extents, so the clamp keeps the *whole* of it in
        frame rather than just its origin.

        **The arms are the widest part, not the hood** — and getting that
        wrong is why the right arm was still being cut off after the first
        version of this clamp. The hood's half-width is 0.78, but a shoulder
        sits at 0.75 with a 0.17 half-width sleeve beyond it, and a raised arm
        mid-wave swings further still, reaching about 1.3 from the centre.

        1.2 is the working figure: past the resting arm, most of the way to a
        fully raised one, and short of reserving so much margin that the
        figure is pushed into the text column for a pose it holds for two
        seconds out of every nine.
      */
      const halfWidth = 1.2 * SCALE;
      const halfHeight = 1.75 * SCALE;
      const maxX = frame.width / 2 - halfWidth - 0.06;
      const maxY = frame.height / 2 - halfHeight - 0.06;

      let targetX = HOME_X + Math.sin(scroll * Math.PI * 3) * SWAY_X;
      // Staying on screen wins over staying out of the text column: if the
      // window is too narrow for both, `MIN_X` is the constraint that gives.
      targetX = Math.min(targetX, maxX);
      targetX = Math.max(targetX, Math.min(MIN_X, maxX));

      let targetY =
        HOME_Y +
        Math.sin(time * 0.8) * 0.07 +
        Math.sin(scroll * Math.PI * 2) * SWAY_Y;
      targetY = Math.max(-maxY, Math.min(maxY, targetY));

      root.current.position.y += (targetY - root.current.position.y) * k;
      root.current.position.x += (targetX - root.current.position.x) * k;
      root.current.position.z += (targetZ - root.current.position.z) * k;
      root.current.rotation.z = Math.sin(time * 0.5) * 0.025;

      /*
        Publish where the top of the hood lands on screen.

        The speech bubble is HTML, outside the canvas, and it has to sit above
        the figure — which moves with scroll, sways, and changes apparent size
        with depth. Recomputing that position in the bubble would be a second
        copy of the maths here, free to drift; asking React to re-render on
        every frame would be worse.

        So the figure projects one point through the camera and writes it to
        two custom properties on the document. The bubble reads them in CSS
        and never re-renders at all.

        `updateMatrixWorld` first, because the position above was assigned
        this frame and the world matrix is otherwise a frame behind — which
        shows up as the bubble trailing the figure by one frame.
      */
      root.current.updateMatrixWorld();
      projected.set(0, HOOD_TOP_Y, 0).applyMatrix4(root.current.matrixWorld);
      projected.project(state.camera);
      const screenX = (projected.x * 0.5 + 0.5) * state.size.width;
      const screenY = (-projected.y * 0.5 + 0.5) * state.size.height;
      const style = document.documentElement.style;
      style.setProperty("--robot-x", `${screenX.toFixed(1)}px`);
      style.setProperty("--robot-y", `${screenY.toFixed(1)}px`);
    }

    if (head.current) {
      /*
        Turns toward the cursor.

        Widened on the owner's report that the head barely moved. It was 0.5
        radians of yaw across the full width of the screen — about 29 degrees
        at the extreme edge, and far less over the area a pointer actually
        occupies, so most of the time it was a few degrees of nothing.

        0.85 is roughly 49 degrees at the edge, which is enough to read as
        following without the head ever turning away from the viewer. The
        pitch stays smaller: a figure that tips its head right back to follow
        a pointer at the top of the page looks broken rather than attentive.
      */
      const kFast = 1 - Math.exp(-5 * delta);
      const targetY = pointer.current.x * 0.85;
      const targetX = -pointer.current.y * 0.34;
      head.current.rotation.y += (targetY - head.current.rotation.y) * kFast;
      head.current.rotation.x += (targetX - head.current.rotation.x) * kFast;

      /*
        The body's yaw, from two things at once.

        **The pointer**, at a fraction of the head's turn. A head that swivels
        on a motionless torso reads as a doll; a little rotation below it is
        what makes the whole figure look like it is paying attention.

        **Scroll**, turning it left, then right, then left again over the
        length of the page. Negative is left: rotating the front vector
        (0,0,1) by θ about Y gives (sin θ, 0, cos θ), so a positive angle
        turns the front toward +X, which is the right.

        It starts by turning left because the figure lives on the right-hand
        side of the composition, so left is back toward the content — it reads
        as the robot looking at what the visitor is reading rather than out of
        the window.
      */
      if (root.current) {
        const bodyYaw =
          targetY * 0.35 -
          Math.sin(scroll * Math.PI * TURN_CYCLES) * SCROLL_TURN;
        root.current.rotation.y +=
          (bodyYaw - root.current.rotation.y) * kFast;
      }
    }

    // A blink: the eyes squash briefly, on an interval rather than every frame.
    const blink = Math.sin(time * 0.8) > 0.994 ? 0.12 : 1;
    if (leftEye.current) leftEye.current.scale.y = blink;
    if (rightEye.current) rightEye.current.scale.y = blink;

    // The wave is a *cycle*, not a loop: arm down most of the time, raised for
    // a couple of seconds now and then. Waving continuously stops reading as a
    // greeting and starts reading as a stuck animation.
    if (wavingArm.current) {
      const phase = time % WAVE_CYCLE;
      let target = ARM_REST;
      if (phase < WAVE_DURATION) {
        const progress = phase / WAVE_DURATION;
        const lift = Math.sin(progress * Math.PI);
        // The side-to-side swing is scaled by the same lift, so it starts and
        // ends at zero rather than jerking as the arm passes through.
        const swing = Math.sin(phase * 9) * 0.3 * lift;
        target = ARM_REST + lift * ARM_RAISED + swing;
      }
      const kArm = 1 - Math.exp(-8 * delta);
      wavingArm.current.rotation.z +=
        (target - wavingArm.current.rotation.z) * kArm;
    }
  });

  return (
    <group ref={root} position={[HOME_X, HOME_Y, 0]} scale={SCALE}>
      {/* ================= Hood and head =============================
          The silhouette. A rounded box with a very large corner radius: a
          sphere reads as a ball and a hard box as a crate, and the reference
          is neither. Nearly as deep as it is wide, so turning toward the
          cursor shows volume rather than a flat card. */}
      <group ref={head} position={[0, 1.02, 0]}>
        <RoundedBox args={[1.56, 1.46, 1.5]} radius={0.56} smoothness={6}>
          <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
        </RoundedBox>

        {/*
          The face: a dark plate in the hood's opening, inside the brim ring
          rather than spanning the whole head. At 1.16 wide it filled the
          opening edge to edge and read as a slab with a mail slot in it — the
          hood has to be visible *around* the face for either to make sense.

          **Every depth here is chosen to avoid z-fighting**, which is what
          produced the flickering striped patch on the face that the owner
          reported as a glitching nose. The hood is 1.5 deep, so its front
          surface is at z = 0.75; this plate was 0.14 thick at z = 0.68, which
          put *its* front at exactly 0.75 too. Two coplanar surfaces give the
          depth buffer no way to decide which is in front, and it alternates
          per pixel — the stripes.

          The stack is now strictly ordered and separated: hood front 0.75,
          plate 0.69 to 0.83, brim 0.73 to 0.83 but well outside the plate in
          XY, eyes 0.845 to 0.895. Nothing shares a plane with anything.
        */}
        <RoundedBox
          args={[0.98, 0.8, 0.14]}
          radius={0.33}
          smoothness={5}
          position={[0, -0.02, 0.76]}
        >
          <meshStandardMaterial color={VISOR} roughness={0.22} metalness={0.4} />
        </RoundedBox>

        {/* Eyes: tall rounded slots, not spheres. `toneMapped={false}` keeps
            the emissive colour from being crushed by the tone curve, so they
            read as lit rather than merely pale. */}
        <mesh ref={leftEye} position={[-0.22, 0.04, 0.87]}>
          <boxGeometry args={[0.15, 0.3, 0.05]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={rightEye} position={[0.22, 0.04, 0.87]}>
          <boxGeometry args={[0.15, 0.3, 0.05]} />
          <meshStandardMaterial
            color={ACCENT}
            emissive={ACCENT}
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>

        {/*
          The brim: the fabric turning back around the face.

          **Not rotated.** A torus is authored in the XY plane, which is
          already the plane of the face — so it rings the opening as drawn.
          The previous version rotated it by 90 degrees about X, which laid it
          flat in the XZ plane and rendered a horizontal bar jutting out of
          the side of the head. It looked like a handle, and it was the single
          worst thing about the figure.
        */}
        <mesh position={[0, -0.02, 0.78]}>
          <torusGeometry args={[0.68, 0.1, 18, 44]} />
          <meshStandardMaterial
            color={HOODIE_SHADE}
            roughness={0.95}
            metalness={0.02}
          />
        </mesh>

        {/* Side pods. Small and dark: they are a machined detail breaking up a
            large soft shape, not a feature. Larger and pale, they read as ears
            — or worse, as something to grab. */}
        {[-0.79, 0.79].map((x) => (
          <mesh key={x} position={[x, -0.06, 0.05]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.1, 20]} />
            <meshStandardMaterial color={METAL} roughness={0.35} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* ================= Body ====================================== */}
      <RoundedBox args={[1.16, 1.0, 0.88]} radius={0.3} smoothness={5}>
        <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
      </RoundedBox>

      {/* Pocket. */}
      <RoundedBox
        args={[0.68, 0.26, 0.08]}
        radius={0.09}
        smoothness={4}
        position={[0, -0.24, 0.46]}
      >
        <meshStandardMaterial
          color={HOODIE_SHADE}
          roughness={0.95}
          metalness={0.02}
        />
      </RoundedBox>

      {/* Drawstrings, hanging from the hood's opening onto the chest. */}
      {[-0.17, 0.17].map((x) => (
        <group key={x} position={[x, 0.36, 0.44]}>
          <mesh>
            <cylinderGeometry args={[0.023, 0.023, 0.3, 8]} />
            <meshStandardMaterial color={HOODIE_SHADE} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.17, 0]}>
            <sphereGeometry args={[0.042, 12, 12]} />
            <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {/* ================= Arms ======================================
          Each group's origin is the shoulder, so rotating it swings the arm
          rather than spinning it about its middle. The left one waves. */}
      {[
        { x: -SHOULDER_X, rest: ARM_REST, ref: wavingArm },
        { x: SHOULDER_X, rest: -ARM_REST, ref: undefined },
      ].map(({ x, rest, ref }) => (
        <group
          key={x}
          ref={ref}
          position={[x, SHOULDER_Y, 0]}
          rotation={[0, 0, rest]}
        >
          {/* The joint. A sphere at the pivot fills the wedge that opens
              between a rotating box and a flat torso side — without it the
              arm visibly detaches as soon as it swings. */}
          <mesh>
            <sphereGeometry args={[0.22, 20, 20]} />
            <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
          </mesh>
          {/* Sleeve. */}
          <RoundedBox
            args={[0.34, 0.62, 0.34]}
            radius={0.16}
            smoothness={4}
            position={[0, -0.32, 0]}
          >
            <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
          </RoundedBox>
          {/* Cuff, so the hand emerges from the sleeve rather than floating
              at the end of it — which is exactly how the last version read. */}
          <mesh position={[0, -0.63, 0]}>
            <cylinderGeometry args={[0.165, 0.165, 0.1, 18]} />
            <meshStandardMaterial
              color={HOODIE_SHADE}
              roughness={0.95}
              metalness={0.02}
            />
          </mesh>
          {/* Hand. */}
          {/* Hand. Machined grey rather than the visor's near-black: at this
              size a black sphere on a pale sleeve reads as a hole punched
              through it, or as something being held. */}
          <mesh position={[0, -0.76, 0]}>
            <sphereGeometry args={[0.17, 18, 18]} />
            <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.55} />
          </mesh>
        </group>
      ))}

      {/* ================= Legs and shoes ============================ */}
      {[-0.31, 0.31].map((x) => (
        <group key={x} position={[x, -0.72, 0]}>
          <RoundedBox args={[0.38, 0.4, 0.38]} radius={0.14} smoothness={4}>
            <meshStandardMaterial color={SHORTS} roughness={0.92} metalness={0.02} />
          </RoundedBox>
          {/* Sneaker: wider than the leg and pushed forward, which is what
              makes a foot read as a shoe rather than as a block. */}
          <RoundedBox
            args={[0.42, 0.26, 0.62]}
            radius={0.12}
            smoothness={4}
            position={[0, -0.34, 0.12]}
          >
            <meshStandardMaterial color={SHOE} roughness={0.55} metalness={0.06} />
          </RoundedBox>
          {/* Sole. */}
          <RoundedBox
            args={[0.44, 0.09, 0.64]}
            radius={0.04}
            smoothness={3}
            position={[0, -0.45, 0.12]}
          >
            <meshStandardMaterial
              color={HOODIE_SHADE}
              roughness={0.7}
              metalness={0.05}
            />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}
