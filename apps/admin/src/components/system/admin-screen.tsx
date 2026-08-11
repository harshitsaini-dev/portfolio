"use client";

/**
 * The admin's system screens: access denied, not found, and a crash.
 *
 * The same shell the public site uses — shared backdrop from `@portfolio/ui`,
 * a mascot from the same family, a fake log — because two apps that are one
 * product should not have two ideas of what a dead end looks like. Only the
 * words, the figure and the way out differ.
 *
 * The screens are pinned to the project's dark palette by
 * `system-screen.css`, deliberately: the admin is light, the site is dark, and
 * before that these four looked like two different products. See the note in
 * that file.
 *
 * A client component because the backdrop paints on a canvas. Each page around
 * it stays a Server Component so it can keep exporting `metadata`.
 */

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { MatrixRain } from "@portfolio/ui/components/matrix-rain";
import {
  SystemMascot,
  type MascotVariant,
} from "@portfolio/ui/components/system-mascot";

export interface AdminScreenLine {
  readonly text: string;
  readonly tone: "prompt" | "muted" | "alert";
}

const TONE_CLASS = {
  prompt: "text-fg",
  muted: "text-fg-muted",
  alert: "text-accent",
} as const;

const LINE_DELAY_MS = 260;

/*
  Reduced motion, as external state.

  Reading it in an effect and calling `setState` renders the screen twice on
  every mount and is what React's own lint rule warns about. A media query is a
  fact about the browser, which is precisely what `useSyncExternalStore` is
  for — the same pattern the public site's header clock uses.
*/
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(listener: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/** No media queries on the server, and no motion to reduce yet. */
function serverMotion(): boolean {
  return false;
}

export function AdminScreen({
  accent,
  mascot,
  status,
  headlinePrefix,
  headline,
  terminalTitle,
  lines,
  children,
  actions,
  footer,
}: {
  /** This screen's accent from the CMS, or null to follow the site's. */
  accent: string | null;
  mascot: MascotVariant;
  status: string;
  headlinePrefix: string;
  headline: string;
  terminalTitle: string;
  lines: readonly AdminScreenLine[];
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const [revealed, setRevealed] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    serverMotion,
  );

  useEffect(() => {
    if (revealed >= lines.length) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), LINE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revealed, lines.length]);

  return (
    <div
      className="offline-screen relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12 sm:px-8"
      /* Scoped here, so the whole screen follows one decision from the CMS and
         nothing outside it is touched. */
      style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}
    >
      <MatrixRain reducedMotion={reducedMotion} />
      <div aria-hidden="true" className="offline-grid" />
      <div aria-hidden="true" className="offline-bloom" />
      <div aria-hidden="true" className="offline-scrim" />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex w-full max-w-2xl flex-col items-center gap-6 text-center"
      >
        <SystemMascot variant={mascot} />

        <p className="offline-pill inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          <span aria-hidden="true" className="offline-pill-dot size-1.5 rounded-full bg-accent" />
          {status}
        </p>

        <h1 className="font-mono text-3xl font-bold uppercase tracking-tight text-fg sm:text-5xl">
          {headlinePrefix}{" "}
          <span className="offline-glow text-accent">{headline}</span>
        </h1>

        <p className="max-w-lg text-balance text-sm text-fg-muted sm:text-base">
          {children}
        </p>

        {/* Set dressing. `aria-hidden`, because it says nothing the sentence
            above does not, and on the denial screen it must not read as a
            diagnosis. */}
        <div
          aria-hidden="true"
          className="offline-terminal w-full overflow-hidden rounded-lg border border-subtle bg-surface/80 text-left font-mono text-xs shadow-2xl backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-accent/70" />
            <span className="size-2.5 rounded-full bg-fg-muted/40" />
            <span className="size-2.5 rounded-full bg-accent/40" />
            <span className="flex-1 text-center text-[0.65rem] uppercase tracking-[0.2em] text-fg-muted">
              {terminalTitle}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-4 py-3">
            {lines.slice(0, revealed).map((line) => (
              <p key={line.text} className={TONE_CLASS[line.tone]}>
                {line.text}
              </p>
            ))}
            {revealed >= lines.length ? (
              <span className="offline-caret mt-1 inline-block h-3.5 w-2 bg-accent" />
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        ) : null}

        {footer}
      </main>
    </div>
  );
}
