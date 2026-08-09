import { CollectionLoading } from "@/components/loading/collection-loading";

/**
 * Shown while this route's server component reads D1.
 *
 * Without it Next.js holds the *previous* page on screen for the whole of
 * that gap, so a click appears to do nothing. The column count matches this
 * list's own table, so the layout does not jump when the rows arrive.
 */
export default function Loading() {
  return <CollectionLoading columns={5} />;
}
