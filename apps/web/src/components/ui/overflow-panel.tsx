"use client";

/**
 * A long list, behind a button, in a panel over the page.
 *
 * ## What problem this is
 *
 * Two lists on this site can grow without limit — the skills inside a
 * category and the tools — and both were originally printed in full. That is
 * fine at nine and wrong at a hundred: on a phone the whole page becomes one
 * list, and inside the skills carousel, whose stage is measured to its tallest
 * card, one long card drags the entire section with it.
 *
 * Capping the list and scrolling it inside a small box was tried and rejected
 * by the person who has to read it: a list you can see a third of, in a box
 * that looks like the end of the card. So the overflow gets more room rather
 * than less — a panel the size of the page, which is what a hundred of
 * anything actually needs.
 *
 * ## The no-JavaScript version is a real one
 *
 * `showModal` needs script, so before hydration — and for a visitor whose
 * script never arrives — this renders a native `<details>` printing the whole
 * list. That version can be tall, and tall is the correct failure: nothing is
 * hidden behind a mechanism that might not run.
 */

import { createPortal } from "react-dom";
import { useRef } from "react";

import { type } from "@/components/ui/typography";
import { useIsClient } from "@/lib/hooks/use-is-client";

export function OverflowPanel({
  /** Names the panel, e.g. "Frontend" or "Tools". */
  title,
  /** Sits under the title, e.g. "105 skills". */
  subtitle,
  /** Labels the button, e.g. "Show all 105". */
  trigger,
  /** Labels it in the folded fallback, e.g. "100 more". */
  fallbackTrigger,
  /** Describes the list for assistive technology. */
  listLabel,
  /** A stable id root for the heading the dialog is labelled by. */
  id,
  /** Everything the panel shows. Rendered in both the panel and the fallback. */
  children,
  /** The fallback's contents, when it should differ from the panel's. */
  fallback,
}: {
  title: string;
  subtitle: string;
  trigger: string;
  fallbackTrigger: string;
  listLabel: string;
  id: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const isClient = useIsClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = `${id}-panel-heading`;

  if (!isClient) {
    return (
      <details className="group mt-4">
        <summary className="glow-row -mx-2 flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {/* Rotates rather than swapping glyphs, so the control does not
              change width as it opens. */}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-150 group-open:rotate-90"
          >
            &rsaquo;
          </span>
          <span className="group-open:hidden">{fallbackTrigger}</span>
          <span className="hidden group-open:inline">Show fewer</span>
        </summary>
        <div aria-label={listLabel} className="mt-4">
          {fallback ?? children}
        </div>
      </details>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="glow-row -mx-2 mt-4 flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">&rsaquo;</span>
        {/* The count is the point: it says how much more there is before
            anybody commits to opening it. */}
        {trigger}
      </button>

      {/*
        Rendered into `document.body` rather than where it is written.

        One caller's card is a slide of a 3D carousel, and that subtree is a
        hostile place for a modal: off-stage slides carry `inert`, which takes
        `pointer-events` with it, and the stage applies a 3D transform, which
        makes any `position: fixed` descendant position itself against the
        slide instead of the viewport. Both were measured — the panel drew in
        the right place and then refused every click and wheel, having
        inherited `pointer-events: none` from a slide that was not on stage.

        The top layer would have handled the stacking either way; it is the
        inherited properties that had to be escaped.
      */}
      {createPortal(
        /*
          A native `<dialog>`, opened with `showModal`.

          It comes with the parts that are easy to get wrong and tedious to
          write: focus moves in and is trapped, Escape closes, the rest of the
          page goes inert to a screen reader. None of that is code here
          because none of it should be.
        */
        <dialog
          ref={dialogRef}
          aria-labelledby={headingId}
          className="overflow-panel"
          /* Clicking the backdrop closes it. The dialog element *is* the
             backdrop as far as the event target goes — a click landing on the
             panel inside stops at the panel. */
          onClick={(event) => {
            if (event.target === dialogRef.current) dialogRef.current?.close();
          }}
          /*
            Put focus back where it came from.

            `<dialog>` restores focus by itself, and everywhere else that
            would be enough — but one caller's panel lives inside a slide of
            an auto-advancing carousel, and by the time it closes React may
            have replaced the button that opened it. Focus then lands on the
            body, which is the top of the page. Refocusing the current trigger
            is a no-op when the element survived, and a rescue when it did not.
          */
          onClose={() => triggerRef.current?.focus()}
        >
          <div
            className="overflow-panel-body"
            /* Read by the smooth-scroll library, which leaves wheels over
               this element to the browser. */
            data-lenis-prevent
            /*
              And scrolled by hand, because that attribute is not enough here.

              The library is *stopped* while a panel is open — that is what
              holds the page still — and a stopped instance swallows the wheel
              before the opt-out is consulted. The panel then could not be
              scrolled with a wheel at all, which is worse than the problem
              being solved. Touch and the keyboard never went through the
              library and still scroll it natively; this is the wheel only.
            */
            onWheel={(event) => {
              event.currentTarget.scrollTop += event.deltaY;
            }}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <h3 id={headingId} className={type.subheading}>
                  {title}
                </h3>
                <p className={`mt-1 ${type.fine}`}>{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                /* Square and forty-four pixels: a close control is the one
                   button on a panel that has to be hittable on a phone. */
                className="glow-row -mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  &times;
                </span>
                <span className="sr-only">Close</span>
              </button>
            </div>

            <div className="mt-6">{children}</div>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
