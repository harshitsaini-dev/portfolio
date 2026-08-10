/**
 * Dates, formatted for reading.
 *
 * Lived in `app/notes/page.tsx` and was imported *from that page* by the note
 * detail route — which works, but makes a page module a utility library and
 * quietly couples two routes through a third thing neither of them is. Moved
 * here when the home page's notes section became the third consumer.
 */

/** `2026-08-10` → `10 August 2026`. Invalid input is returned unchanged. */
export function formatNoteDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        // Fixed locale and zone: the server and the browser must agree, and a
        // date rendered in the visitor's zone can be a day off the date the
        // post claims.
        timeZone: "UTC",
      });
}
