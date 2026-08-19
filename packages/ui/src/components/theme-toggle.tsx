"use client";

/**
 * The visitor's own light/dark control.
 *
 * ## Three states, because there are three
 *
 * System, light and dark — the same set the CMS already models in
 * `THEME_PREFERENCES`. A two-way switch would be simpler, but it takes
 * something away: once a visitor touched it they could never get back to
 * "follow my operating system", which is what most people actually want and
 * what the site does by default. The button cycles, and its label always says
 * which of the three is active.
 *
 * ## It layers over the CMS default rather than replacing it
 *
 * The server renders `data-theme` from the site's configured default. This
 * only writes that attribute once a visitor has expressed a preference, and
 * clearing back to "system" removes it again — so a site whose owner sets
 * "dark" in the CMS keeps starting dark for everyone who has not chosen.
 *
 * The two are stored separately for that reason. The CMS value is the site's
 * default; `localStorage` holds this one visitor's override.
 *
 * ## The flash is prevented in the document, not here
 *
 * A React component cannot run before first paint, so a stored preference
 * applied here would arrive one frame after the wrong theme had already been
 * painted. The blocking script in `layout.tsx` does that part; this component
 * only handles the interaction and reads the state the script left behind.
 */

import { useSyncExternalStore } from "react";

import {
  applyThemeChoice,
  getServerThemeChoice,
  getThemeChoice,
  subscribeToThemeChoice,
  type ThemeChoice,
} from "../theme.ts";

/** The cycle order, and what the button moves to next. */
const ORDER: readonly ThemeChoice[] = ["system", "light", "dark"];

const LABELS: Readonly<Record<ThemeChoice, string>> = {
  system: "Theme: follows your system",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function ThemeToggle() {
  /*
    Read as an external store, not as state.

    The choice is a fact about the browser rather than something this
    component owns, and saying so avoids the `useState` plus mount-effect
    pattern that renders once with a placeholder and again with the truth.
    It also means a change made in one tab reaches the others — see
    `../theme.ts`.
  */
  const choice = useSyncExternalStore(
    subscribeToThemeChoice,
    getThemeChoice,
    getServerThemeChoice,
  );

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] as ThemeChoice;

  return (
    <button
      type="button"
      onClick={() => applyThemeChoice(next)}
      /*
        The label carries the state, and it is the *current* state rather than
        the action.

        A button labelled "Switch to dark" tells a screen-reader user what
        will happen but never what is true now, and after pressing it the
        label changes to something they did not ask about. Naming the current
        theme means the button answers "what is it set to?" — and
        `aria-live="polite"` on the label announces the change once it has
        happened, which is the thing that actually needs confirming.
      */
      aria-label={LABELS[choice]}
      title={LABELS[choice]}
      className="press inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-live="polite" className="sr-only">
        {LABELS[choice]}
      </span>
      {/* Decorative: the label above is the accessible name. Inline SVG rather
          than an icon dependency — three small paths do not justify one. */}
      <ThemeIcon choice={choice} />
    </button>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (choice === "dark") {
    // Crescent.
    return (
      <svg {...common}>
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }

  if (choice === "light") {
    // Sun.
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    );
  }

  // System: a display, which is the thing whose setting is being followed.
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
