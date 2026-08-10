/**
 * The notes index.
 *
 * Deliberately text-first: a list of headlines and one-line summaries reads
 * faster than a grid of cards, and what someone is scanning for here is a
 * sentence that interests them, not a picture.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, EmptyStateElsewhere } from "@/components/ui/empty-state";
import { ShareButton } from "@/components/ui/share-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedNotes } from "@/lib/content/notes";
import { getSiteContent } from "@/lib/content/site-content";
import { formatNoteDate } from "@/lib/format-date";
import { absoluteMediaUrl, getSiteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";


export async function generateMetadata(): Promise<Metadata> {
  const [content, origin] = await Promise.all([getSiteContent(), getSiteOrigin()]);
  const title = `Notes · ${content.siteName}`;
  const description = `Short posts by ${content.profile.name} on building things for the web.`;
  const shareImage = content.shareImage ?? content.profile.image;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: "/notes" },
    openGraph: {
      type: "website",
      url: "/notes",
      title,
      description,
      images: shareImage
        ? [{ url: absoluteMediaUrl(origin, shareImage.id), alt: shareImage.alt }]
        : undefined,
    },
    twitter: {
      card: shareImage ? "summary_large_image" : "summary",
      title,
      description,
      images: shareImage ? [absoluteMediaUrl(origin, shareImage.id)] : undefined,
    },
  };
}

export default async function NotesIndexPage() {
  const [content, notes] = await Promise.all([getSiteContent(), getPublishedNotes()]);

  return (
    <>
      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      <main id="main-content" className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Notes
            </h1>
            <p className="mt-3 max-w-2xl text-fg-muted">
              Short posts about building things — what broke, what I chose, and
              why.
            </p>
          </div>
          <ShareButton title={`Notes · ${content.siteName}`} />
        </div>

        {notes.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              title="Nothing written here yet"
              action={<EmptyStateElsewhere socials={content.socials} />}
            >
              Short posts about building things — what broke, what I chose, and
              why. The first one is on its way.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-12 flex flex-col divide-y divide-subtle border-y border-subtle">
            {notes.map((note) => (
              <li key={note.slug}>
                <Link
                  href={`/notes/${note.slug}`}
                  className="group flex flex-col gap-2 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {/* `dateTime` carries the machine-readable value; the text is
                      for people. */}
                  <time
                    dateTime={note.date}
                    className="font-mono text-xs text-fg-muted"
                  >
                    {formatNoteDate(note.date)}
                  </time>
                  <h2 className="text-xl font-semibold text-fg group-hover:text-accent">
                    {note.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {note.summary}
                  </p>
                  {note.tags.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-fg-muted"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter
        siteName={content.siteName}
        note={content.footerNote}
        socials={content.socials}
      />
    </>
  );
}
