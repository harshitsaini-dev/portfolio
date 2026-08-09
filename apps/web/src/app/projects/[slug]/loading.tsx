import { Skeleton, SkeletonScreen } from "@portfolio/ui/components/skeleton";

import { Container } from "@/components/ui/container";

/**
 * Shown while a case-study page reads its project from D1.
 *
 * ## Why the public site needs this in exactly one place
 *
 * The home page is a single server render and a visitor arrives at it
 * directly — there is no in-app navigation to cover. This route is different:
 * it is reached by clicking a project *from* the home page, and until its data
 * arrives Next.js keeps the home page on screen. Without this file the click
 * appears to do nothing, which is the one moment on the public site where a
 * visitor can be left wondering whether the site is broken.
 *
 * ## The header IS drawn here, and that was a correction
 *
 * The first version left it out, reasoning that Next.js keeps the surrounding
 * layout and only replaces the segment. That is true in general and **false in
 * this app**: the site header is rendered by `page.tsx`, not by a layout, so
 * it is inside the segment being replaced.
 *
 * Measured: during loading there was no header at all, and when the content
 * arrived every element shifted down by its height. A skeleton that causes the
 * jump it exists to prevent is worse than none — so a bar of the same height
 * and the same bottom rule holds the space.
 *
 * ## Shapes taken from the real page
 *
 * Breadcrumb, period, title, summary, actions, then the body — at the same
 * widths and the same vertical rhythm as `page.tsx`. That is the whole point:
 * when the content lands, nothing moves.
 */
export default function Loading() {
  return (
    <>
      {/* The header's space, held. `h-16` and the same hairline rule as
          `SiteHeader`, so nothing moves when the real one arrives. */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-20 h-16 border-b border-subtle bg-bg/85 backdrop-blur-md"
      />

      <main className="flex-1">
        <SkeletonScreen label="Loading project">
          <Container className="py-16 sm:py-20">
            {/* Breadcrumb. */}
            <Skeleton className="h-4 w-40" />

            {/* Period, title, summary. */}
            <Skeleton className="mt-8 h-3 w-28" />
            <Skeleton className="mt-3 h-12 w-full max-w-xl" />
            <Skeleton className="mt-6 h-5 w-full max-w-2xl" />
            <Skeleton className="mt-2 h-5 w-full max-w-lg" />

            {/* The action row. Two buttons at the real target height, so the
              page below them does not shift when they arrive. */}
            <div className="mt-10 flex flex-wrap gap-4">
              <Skeleton className="h-11 w-36 rounded-md" />
              <Skeleton className="h-11 w-28 rounded-md" />
            </div>

            {/* Body copy. Decreasing widths, because a paragraph's last line is
              short and a stack of equal bars reads as a table. */}
            <div className="mt-14 flex max-w-2xl flex-col gap-3">
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>

            {/* The gallery, two up, at the cover's own aspect ratio. */}
            <div className="mt-14 grid gap-8 sm:grid-cols-2">
              <Skeleton className="aspect-[16/9] h-auto w-full rounded-lg" />
              <Skeleton className="aspect-[16/9] h-auto w-full rounded-lg" />
            </div>
          </Container>
        </SkeletonScreen>
      </main>
    </>
  );
}
