/**
 * Loading placeholders.
 *
 * Shared between both apps because both need the same thing and a second
 * implementation would drift on the two details that actually matter here:
 * what a screen reader is told, and what happens under reduced motion.
 *
 * ## A skeleton is not content, and must not be read as content
 *
 * Every bar below is `aria-hidden`. A screen reader announcing "blank, blank,
 * blank" while a page loads is worse than silence — it describes the loading
 * *mechanism* rather than the page. `SkeletonScreen` wraps a set of them with
 * one polite status message, so assistive technology hears "Loading" once and
 * then the real content when it arrives.
 *
 * ## Shimmer is optional; the placeholder is not
 *
 * The moving highlight lives inside `prefers-reduced-motion: no-preference`
 * in `motion.css`. Without it the bars are still there, still the right shape,
 * just still. The failure mode is "a calm placeholder", never "nothing".
 *
 * ## Shapes, not a spinner
 *
 * The bars mirror the layout that is coming — a heading's width, a table's
 * columns. A spinner says "something is happening"; a skeleton says "this is
 * what is about to be here", which is what stops the page jumping when it
 * arrives.
 */

import * as React from "react";

import { cn } from "../lib/utils.ts";

/**
 * One placeholder bar.
 *
 * Size it with `className`. The default is a line of text — the most common
 * case by a wide margin, and a default that has to be overridden every time
 * is not a default.
 */
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton h-4 w-full rounded-md", className)}
      {...props}
    />
  );
}

/**
 * A group of placeholders, announced once.
 *
 * `role="status"` is polite: it waits for a gap rather than interrupting,
 * which is right for something that will be replaced in a moment anyway.
 * `aria-busy` tells assistive technology the region is mid-update, so a
 * screen reader that supports it can hold off describing the subtree.
 *
 * The visible children stay `aria-hidden` via `Skeleton` itself; the only
 * thing announced is the label.
 */
export function SkeletonScreen({
  label = "Loading",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div role="status" aria-busy="true" className={className} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * The shape of a table while its rows are loading.
 *
 * Every admin collection renders the same table, so the placeholder for one
 * is written once. `columns` and `rows` exist because a five-column table
 * pretending to be three is a layout shift waiting to happen.
 */
export function SkeletonTable({
  columns = 3,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      {/* The header row, slightly narrower bars so it reads as headings
          rather than as one more row of content. */}
      <div
        className="flex gap-4 border-b border-subtle pb-3"
        aria-hidden="true"
      >
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="h-3 w-24" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-subtle py-3">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              // The first column is the row's name in every one of these
              // tables, so it is wider. Uniform bars read as a grid rather
              // than as a list of things with names.
              className={column === 0 ? "h-4 w-48" : "h-4 w-28"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
