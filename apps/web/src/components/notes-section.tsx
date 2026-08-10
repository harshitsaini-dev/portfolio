import Link from "next/link";

import { EmptyState, EmptyStateElsewhere } from "@/components/ui/empty-state";
import { Section } from "@/components/section";
import { type } from "@/components/ui/typography";
import type { SocialProfile } from "@/data/types";
import type { NoteSummary } from "@/lib/content/notes";
import type { SectionCopy } from "@/lib/content/sections";
import { formatNoteDate } from "@/lib/format-date";

/**
 * The writing, on the home page.
 *
 * ## Why this exists at all
 *
 * `/notes` was reachable only by typing the URL or by running `notes` in the
 * terminal — a blog nobody can find is not a blog. This section is the answer
 * for a visitor who never leaves the home page, and the route links in the
 * header and footer are the answer for one who does.
 *
 * ## It renders only if the owner asks for it
 *
 * Like every other section, it appears when a row with key `notes` exists in
 * the CMS and is visible, in whatever position the owner put it. The home page
 * maps over the section list rather than hardcoding an order, so this file
 * chooses nothing about where it sits — and the header navigation is derived
 * from that same list, so the anchor link and the section can never disagree.
 *
 * ## Three, not all of them
 *
 * The home page is a summary. The full list is one link away, and that link is
 * always rendered when there is anything to see — a teaser with no way through
 * to the rest is a dead end.
 */
const MAX_ON_HOME = 3;

export function NotesSection({
  notes,
  copy,
  socials,
}: {
  notes: readonly NoteSummary[];
  copy: SectionCopy;
  /** Only used when there is nothing published, to offer somewhere else. */
  socials: readonly SocialProfile[];
}) {
  const shown = notes.slice(0, MAX_ON_HOME);

  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
    >
      {shown.length === 0 ? (
        <EmptyState
          title="Nothing written here yet"
          action={<EmptyStateElsewhere socials={socials} />}
        >
          Short posts about building things — what broke, what I chose, and
          why. The first one is on its way.
        </EmptyState>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-subtle border-y border-subtle">
            {shown.map((note) => (
              <li key={note.slug}>
                <Link
                  href={`/notes/${note.slug}`}
                  className="group flex flex-col gap-2 py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {/* `dateTime` carries the machine-readable value; the text
                      is for people. */}
                  <time dateTime={note.date} className={type.meta}>
                    {formatNoteDate(note.date)}
                  </time>
                  <h3 className="text-xl font-semibold text-fg group-hover:text-accent">
                    {note.title}
                  </h3>
                  <p className={type.bodySm}>{note.summary}</p>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-10">
            <Link
              href="/notes"
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Read all notes
            </Link>
          </p>
        </>
      )}
    </Section>
  );
}
