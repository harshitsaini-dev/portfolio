"use client";

/**
 * The projects, as a 3D slideshow.
 *
 * ## It is an enhancement, and it can only ever add
 *
 * The same `<ul>` of the same `ProjectCard`s renders either way. What changes
 * is the arrangement, and the arrangement only switches on when **three**
 * things are true: JavaScript is running, the visitor has not asked for
 * reduced motion, and the viewport is at least `md`. Fail any of them and the
 * markup is the plain grid this section has always been.
 *
 * That is the project's rule about never hiding content behind a mechanism
 * that might not run, applied to a carousel — the component that breaks that
 * rule most often. Here the initial state is "everything visible"; the
 * carousel is what takes things away, so a carousel that never starts leaves
 * a complete, readable list.
 *
 * The 3D itself lives in `motion.css`, inside both a `min-width` query and
 * `prefers-reduced-motion: no-preference`, driven by a `--offset` custom
 * property this component sets per slide. So even if this component somehow
 * applied its state at the wrong moment, the CSS still refuses to stack the
 * cards on a narrow screen or for a visitor who asked for stillness.
 *
 * ## Reaching every project without a mouse
 *
 * Off-screen slides are `inert`, so a keyboard cannot tab into a card it
 * cannot see and links behind the active card are not focus traps. That does
 * hide them, so the controls have to be complete:
 *
 *   * Previous and Next buttons, both properly labelled.
 *   * Left and Right arrow keys on the group itself.
 *   * A `role="status"` line announcing "Project 2 of 5", so a screen-reader
 *     user knows where they are and that there is more.
 *
 * ## The automatic loop stops when it should
 *
 * Advancing on a timer is hostile if it moves while someone is reading or
 * interacting. It pauses on hover, on focus anywhere inside, and when the tab
 * is hidden — the last one so a background tab is not re-rendering forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ProjectCard } from "@/components/project-card";
import type { Project } from "@/data/types";
import { useIsClient } from "@/lib/hooks/use-is-client";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

/**
 * The width at which the carousel takes over.
 *
 * **Must stay in step with `motion.css`.** The CSS decides the arrangement and
 * this decides the behaviour, and if they disagree the result is the worst of
 * both: before this query existed, a phone rendered a plain grid of four
 * cards while the component marked three of them `inert` — visible, but with
 * dead links and skipped by screen readers.
 */
const CAROUSEL_QUERY = "(min-width: 48rem)";

/** How long each slide holds before the loop advances, in milliseconds. */
const AUTOPLAY_MS = 6000;

/**
 * Slides drawn either side of the active one.
 *
 * Beyond this they are placed off-stage rather than rendered ever deeper: the
 * transform is a translate and a rotate per slide, and drawing twenty of them
 * on a long list costs compositing for cards nobody can see.
 */
const VISIBLE_NEIGHBOURS = 2;

/**
 * The signed distance from `active` to `index`, taking the shorter way round.
 *
 * This is what makes the loop read as a loop. With five projects, going next
 * from the last should slide the first in from the right rather than rewinding
 * four positions to the left — so the distance from 4 to 0 is +1, not -4.
 */
function circularOffset(index: number, active: number, total: number): number {
  const raw = (((index - active) % total) + total) % total;
  return raw > total / 2 ? raw - total : raw;
}

export function ProjectsCarousel({ projects }: { projects: readonly Project[] }) {
  const isClient = useIsClient();
  const reducedMotion = usePrefersReducedMotion();
  const wideEnough = useMediaQuery(CAROUSEL_QUERY);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLUListElement>(null);

  const total = projects.length;

  /**
   * Whether to arrange as a carousel at all.
   *
   * A single project is a card, not a slideshow — arrows that cycle one item
   * are controls that do nothing.
   */
  const enhanced = isClient && !reducedMotion && wideEnough && total > 1;

  const go = useCallback(
    (direction: 1 | -1) => {
      setActive((current) => (current + direction + total) % total);
    },
    [total],
  );

  /*
    The stage is as tall as its tallest card, measured.

    The slides are absolutely positioned, so they contribute no height and the
    stage has to be given one. It was a fixed 34rem — a number derived from
    the cards as they were on the day, which went stale the moment a card grew:
    the owner reported a project cut off along its bottom edge, and the stage's
    `overflow: hidden` was doing exactly what it was told.

    `offsetHeight`, not `getBoundingClientRect().height`: the slides carry a
    3D rotation, and a rect measures the *rotated* bounding box, which is
    taller than the card and would leave a growing gap under the shortest one.
    `offsetHeight` is the layout height, before any transform.

    A `ResizeObserver` rather than a window listener, because the card's height
    depends on its own width — which changes with the container, not only with
    the viewport — and because content can change under it.
  */
  useEffect(() => {
    const stage = stageRef.current;
    if (!enhanced || !stage) return;

    const measure = () => {
      let tallest = 0;
      for (const slide of stage.children) {
        if (slide instanceof HTMLElement) {
          tallest = Math.max(tallest, slide.offsetHeight);
        }
      }
      // A little slack, so the soft edge of the mask has something to fade
      // through rather than clipping exactly at the last pixel of text.
      if (tallest > 0) {
        stage.style.setProperty("--stage-height", `${tallest + 16}px`);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    for (const slide of stage.children) observer.observe(slide);
    return () => observer.disconnect();
  }, [enhanced, projects]);

  /**
   * The automatic loop.
   *
   * A single timeout re-armed on each change rather than an interval, so
   * moving by hand restarts the clock: pressing Next and then being moved
   * along again 200ms later is the behaviour that makes carousels feel like
   * they are fighting you.
   */
  useEffect(() => {
    if (!enhanced || paused) return;
    const id = window.setTimeout(() => go(1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [enhanced, paused, active, go]);

  /** Pause in a hidden tab, and only resume if nothing else is holding it. */
  useEffect(() => {
    if (!enhanced) return;
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
      else if (!regionRef.current?.matches(":hover, :focus-within")) {
        setPaused(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enhanced]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!enhanced) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  };

  return (
    <div
      ref={regionRef}
      // A group rather than a region: it is part of the Projects section, not
      // a landmark of its own. The label still names it, so a screen reader
      // announces what the arrow keys belong to.
      role={enhanced ? "group" : undefined}
      aria-roledescription={enhanced ? "carousel" : undefined}
      aria-label={enhanced ? "Projects" : undefined}
      onKeyDown={onKeyDown}
      /*
        Focus pauses anywhere in the group; the pointer does NOT.

        Pointer pausing is attached to the active card and the controls
        instead — see below. It was on this wrapper first, which spans the
        full section width and the whole height of the stage, so a mouse
        resting anywhere near the projects stopped the loop entirely. It was
        reported as the slides not advancing at all, and that was exactly
        right: the pause region was so large it was almost always active.

        Focus is different and belongs here. It only ever lands on a control
        or a link inside the active card, so it cannot misfire, and someone
        tabbing through must not have the content move under them.
      */
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        // Only resume once focus has actually left the group — `blur` fires
        // when moving between two cards inside it as well.
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <ul
        ref={stageRef}
        className={
          enhanced
            ? // `project-stage` supplies the perspective and the absolute
              // positioning, and only inside the media query — see motion.css.
              "project-stage grid gap-6 md:grid-cols-2"
            : "grid gap-6 md:grid-cols-2"
        }
      >
        {projects.map((project, index) => {
          if (!enhanced) {
            return (
              <li key={project.slug}>
                <ProjectCard project={project} />
              </li>
            );
          }

          const offset = circularOffset(index, active, total);
          const distance = Math.abs(offset);
          const onStage = distance <= VISIBLE_NEIGHBOURS;
          const isActive = offset === 0;

          return (
            <li
              key={project.slug}
              className="project-slide"
              // The transform is computed in CSS from these, so the same
              // numbers drive position, depth, rotation, fade and stacking
              // order without five inline styles that could disagree.
              style={
                {
                  "--offset": offset,
                  "--distance": distance,
                  // Placed off-stage rather than unmounted: keeping the card
                  // in the DOM means the browser animates it back in rather
                  // than popping it into existence mid-transition.
                  "--on-stage": onStage ? 1 : 0,
                } as React.CSSProperties
              }
              // Everything but the active card is inert: not focusable, not
              // announced, not clickable. A link you cannot see is a link you
              // should not be able to tab into.
              inert={!isActive}
              aria-hidden={!isActive}
              /*
                Pause while the pointer is over the card someone is reading,
                and only that card. It is roughly 448px wide against a stage
                of 1072, so the loop keeps running everywhere else in the
                section — which is what makes it read as a slideshow at all.

                Attached to every slide rather than only the active one so the
                handler does not appear and disappear as the active index
                changes; the off-stage slides have `pointer-events: none`, so
                they can never fire it.
              */
              onPointerEnter={() => setPaused(true)}
              onPointerLeave={() => setPaused(false)}
            >
              <ProjectCard project={project} />
            </li>
          );
        })}
      </ul>

      {enhanced ? (
        <div
          className="mt-8 flex items-center justify-center gap-4"
          // The controls pause too: reaching for Next only to have the slide
          // change under the cursor first is the classic carousel annoyance.
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
        >
          <CarouselButton label="Previous project" onClick={() => go(-1)}>
            {/* `aria-hidden` on the glyph: the button's label already says
                what it does, and a screen reader reading "left arrow" after
                "Previous project" is noise. */}
            <span aria-hidden="true">←</span>
          </CarouselButton>

          {/*
            The position, announced.

            `role="status"` is polite, so it waits for a gap rather than
            interrupting — right for something that changes on a timer.
          */}
          <p role="status" className="min-w-24 text-center font-mono text-xs tabular-nums text-fg-muted">
            {active + 1} / {total}
          </p>

          <CarouselButton label="Next project" onClick={() => go(1)}>
            <span aria-hidden="true">→</span>
          </CarouselButton>
        </div>
      ) : null}
    </div>
  );
}

function CarouselButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // `min-h-11`/`min-w-11` is the project's minimum target size, and the
      // focus ring is explicit rather than inherited so it stays visible over
      // the moving cards behind it.
      className="press glow-hover glass inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-strong text-fg hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
