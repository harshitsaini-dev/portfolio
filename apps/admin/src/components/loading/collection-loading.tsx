import { Skeleton, SkeletonScreen, SkeletonTable } from "@portfolio/ui/components/skeleton";

/**
 * The loading state every admin collection shares.
 *
 * Fourteen list routes render the same shape — an eyebrow, a title, a count
 * line, a "New …" button, then a table — so their placeholder is written once.
 * Fourteen near-identical `loading.tsx` files is how the third one quietly
 * stops matching its page.
 *
 * ## Why these routes need one at all
 *
 * Every admin page is dynamic and reads D1 on the server, so navigating
 * between them has a real gap. Without a `loading.tsx`, Next.js holds the
 * *previous* page on screen for the whole of it: the visitor clicks Tools, the
 * Projects list stays put, and nothing says anything is happening. A skeleton
 * turns that into an immediate response.
 *
 * ## It mirrors the layout rather than spinning
 *
 * Same max width, same header rhythm, same table shape. A spinner says
 * "something is happening"; this says "this is what is about to be here",
 * which is also what stops the page jumping when it arrives.
 */
export function CollectionLoading({
  /** Table columns to draw. Match the page, or the layout will jump. */
  columns = 3,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <SkeletonScreen label="Loading" className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* Eyebrow, title, count line — the same three lines every one of
              these pages opens with, at the same sizes. */}
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-64" />
        </div>
        {/* The "New …" button. `min-h-11` so the header does not change height
            when the real one replaces it. */}
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>

      <SkeletonTable columns={columns} rows={rows} />
    </SkeletonScreen>
  );
}

/**
 * The loading state for a create/edit form.
 *
 * A narrower column than a list, a breadcrumb, a title, then stacked fields —
 * which is every form route in the admin.
 */
export function FormLoading({ fields = 5 }: { fields?: number }) {
  return (
    <SkeletonScreen label="Loading" className="mx-auto w-full max-w-3xl">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-56" />

      <div className="mt-8 flex flex-col gap-8">
        {Array.from({ length: fields }, (_, field) => (
          <div key={field} className="flex flex-col gap-2">
            {/* Label, then control. Two bars rather than one, because a field
                is two lines tall and a single bar would collapse the form's
                rhythm the moment it loaded. */}
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ))}
      </div>

      <div className="mt-10 flex gap-3">
        <Skeleton className="h-11 w-32 rounded-md" />
        <Skeleton className="h-11 w-24 rounded-md" />
      </div>
    </SkeletonScreen>
  );
}
