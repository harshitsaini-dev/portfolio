/**
 * One drawing per dead end.
 *
 * The robot was on all of them at first, and it was wrong on three: the same
 * character waving at you whether the network died, the address was bad, or
 * the page crashed says the site does not know the difference. Each screen now
 * gets a figure that is *about* its failure, drawn in the same line-art
 * language so they still read as one family — 2.5px strokes, `currentColor`,
 * the accent behind a soft glow.
 *
 * | Screen  | Figure  | Why |
 * | ------- | ------- | --- |
 * | offline | plug    | it is out of the socket, and the arc will not jump |
 * | 404     | compass | the needle spins and will not settle |
 * | error   | gear    | a tooth is missing and it judders |
 * | denied  | padlock | it is shut, and the keyhole is watching |
 *
 * All four are `aria-hidden`: the heading beside them already says what
 * happened, and a screen reader announcing a compass adds nothing. Every
 * animation lives in `globals.css` behind a reduced-motion query — the figures
 * are the same drawings when still.
 */

export type MascotVariant = "signal" | "compass" | "gear" | "lock";

export function SystemMascot({ variant }: { variant: MascotVariant }) {
  if (variant === "compass") return <Compass />;
  if (variant === "gear") return <Gear />;
  if (variant === "lock") return <Lock />;
  return <Unplugged />;
}

/** Shared canvas: same box, same stroke weight, same glow. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 140"
      className="offline-robot h-32 w-auto sm:h-40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/**
 * Offline: the two ends of a cable, pulled apart.
 *
 * The robot lived here first and was the wrong drawing: it is the site's
 * mascot, so it waved hello on a screen whose subject is that nothing is
 * getting through. A disconnected cable says the thing itself, and it rhymes
 * with the puzzle underneath — which is also about joining a broken line.
 *
 * ## Why two connectors rather than a plug and a wall
 *
 * A plug in a switchboard is a picture about *this room*: a socket, a switch,
 * a wall. A male end and a female end with the gap between them is a picture
 * about *a link*, which is what actually broke. It also removes the last
 * ambiguity the earlier drawings had — with a plate you have to decide whether
 * the thing on the right is a socket or a speaker or a panel, whereas a female
 * connector with a cable coming out of it can only be one thing.
 *
 * ## What the earlier attempts got wrong
 *
 * Blown up to 300px, attempt two read as two gadgets facing each other:
 *
 * - **The cable curled into a closed loop**, which at a glance is a circle
 *   sitting on the plug rather than slack hanging off it. Slack is an open
 *   curve that leaves the frame — both cables here do.
 * - **The two bodies were the same shape.** They are now clearly different:
 *   one has prongs, the other has a recess cut into its face.
 * - **The prongs nearly touched.** The gap is the whole subject, so it is wide
 *   and the prongs and holes share their heights exactly — which is what says
 *   these two belong together.
 * - **A spark across the gap read as an arrow.** Two chevrons pointing at the
 *   socket look like an instruction — "insert here" — rather than electricity
 *   failing to jump. The gap says it on its own; nothing was added back.
 */
function Unplugged() {
  return (
    <Frame>
      {/* -------------------------------------------------- male end, left */}
      {/* This is the half that moves: it tries the other end and falls back. */}
      <g className="mascot-plug">
        <line x1="42" y1="68" x2="52" y2="68" strokeWidth="5" />
        <line x1="42" y1="82" x2="52" y2="82" strokeWidth="5" />

        <rect x="16" y="56" width="26" height="38" rx="7" fill="var(--surface)" />
        {/* One ridge, off centre, so the body has a front and a back. */}
        <path d="M30 63v24" opacity="0.35" strokeWidth="2" />

        {/* Strain relief: a short collar where the cable meets the body. */}
        <rect x="8" y="65" width="8" height="20" rx="3" fill="var(--surface)" strokeWidth="2" />

        {/* Slack, leaving the frame at the bottom. Heavier than every other
            line, because weight is what makes a cable read as a cable. */}
        <path d="M8 75C2 80 2 95 10 104s6 14 0 20" strokeWidth="4" opacity="0.9" />
      </g>

      {/* ----------------------------------------------- female end, right */}
      <g>
        <rect x="66" y="52" width="32" height="46" rx="8" fill="var(--surface)" />

        {/* The recess, cut into the left face and darker than the body, with
            the two holes at exactly the prong heights. */}
        <rect x="66" y="62" width="13" height="26" rx="4" fill="var(--bg)" strokeWidth="2" />
        <rect x="69" y="66.5" width="7" height="3.5" rx="1.75" fill="currentColor" stroke="none" opacity="0.85" />
        <rect x="69" y="80.5" width="7" height="3.5" rx="1.75" fill="currentColor" stroke="none" opacity="0.85" />

        {/* Its own collar and cable, leaving to the right — so the drawing is
            two ends of one run rather than one end and a wall. */}
        <rect x="98" y="64" width="8" height="22" rx="3" fill="var(--surface)" strokeWidth="2" />
        <path d="M106 75c8 0 12-9 10-19s2-14 2-14" strokeWidth="4" opacity="0.9" />
      </g>

      {/*
        Three dots across the gap, lighting in sequence and going out before
        they reach the other side.

        This replaced two chevrons, which were meant to be an electrical arc
        and read as arrows pointing at the socket — an instruction to insert
        the plug rather than a signal failing to cross. Dots cannot point at
        anything, which is exactly why they work here.
      */}
      <g className="mascot-dots" fill="currentColor" stroke="none">
        <circle cx="57" cy="75" r="2" />
        <circle cx="63" cy="75" r="2" />
        <circle cx="69" cy="75" r="2" />
      </g>
    </Frame>
  );
}

/** 404: a compass whose needle will not settle. */
function Compass() {
  return (
    <Frame>
      <g className="mascot-float">
        <circle cx="60" cy="70" r="40" fill="var(--surface)" />
        <circle cx="60" cy="70" r="32" opacity="0.35" strokeWidth="1.5" />

        {/* The cardinal ticks, so it reads as an instrument rather than a
            wheel. Dimmed — the needle is the thing that matters. */}
        <g opacity="0.5" strokeWidth="2">
          <line x1="60" y1="34" x2="60" y2="42" />
          <line x1="60" y1="98" x2="60" y2="106" />
          <line x1="24" y1="70" x2="32" y2="70" />
          <line x1="88" y1="70" x2="96" y2="70" />
        </g>

        {/* The needle. Two halves so the leading one can be solid and the
            trailing one hollow, which is what makes a spin readable. */}
        <g className="mascot-needle">
          <path d="M60 44 66 70 60 66 54 70Z" fill="currentColor" stroke="none" />
          <path d="M60 96 54 70 60 74 66 70Z" fill="var(--bg)" />
        </g>

        <circle cx="60" cy="70" r="3" fill="currentColor" stroke="none" />
      </g>
    </Frame>
  );
}

/** Error: a gear with a tooth missing, so of course it judders. */
function Gear() {
  // Eleven teeth around the circle, with the twelfth left out. The gap is the
  // whole joke, so it sits at the top where it cannot be missed.
  const teeth = Array.from({ length: 12 }, (_, i) => i).filter((i) => i !== 0);

  return (
    <Frame>
      <g className="mascot-judder">
        {teeth.map((i) => {
          const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const inner = 34;
          const outer = 44;
          const x1 = 60 + Math.cos(angle) * inner;
          const y1 = 70 + Math.sin(angle) * inner;
          const x2 = 60 + Math.cos(angle) * outer;
          const y2 = 70 + Math.sin(angle) * outer;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="5" />;
        })}
        <circle cx="60" cy="70" r="34" fill="var(--surface)" />
        <circle cx="60" cy="70" r="14" fill="var(--bg)" />
      </g>

      {/* The spark where the tooth should be. Pulses rather than spins, so it
          stays put while the gear shakes under it. */}
      <g className="mascot-spark" stroke="none" fill="currentColor">
        <path d="M62 18l-8 14h7l-3 12 10-16h-7z" />
      </g>
    </Frame>
  );
}

/** Denied: shut, and looking back at you. */
function Lock() {
  return (
    <Frame>
      <g className="mascot-float">
        {/* The shackle. It nudges — the animation of something tried and
            refused — rather than opening, because it does not open. */}
        <path className="mascot-shackle" d="M42 58V44a18 18 0 0 1 36 0v14" />
        <rect x="30" y="58" width="60" height="50" rx="12" fill="var(--surface)" />

        {/* The keyhole as an eye, which is the one liberty this drawing takes:
            an access screen that watches you is funnier than one that does not. */}
        <circle cx="60" cy="78" r="8" fill="var(--bg)" />
        <circle className="mascot-pupil" cx="60" cy="78" r="3.5" fill="currentColor" stroke="none" />
        <path d="M60 86v10" strokeWidth="3" />
      </g>
    </Frame>
  );
}
