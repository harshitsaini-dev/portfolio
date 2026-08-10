/**
 * One note.
 *
 * The body is Markdown, rendered by `Markdown` — an explicit parser that
 * builds React elements. There is no HTML string anywhere in this path, so a
 * post cannot inject markup into the page whatever an editor types.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/ui/markdown";
import { ShareButton } from "@/components/ui/share-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getNoteDetail } from "@/lib/content/notes";
import { getSiteContent } from "@/lib/content/site-content";
import { absoluteMediaUrl, getSiteOrigin } from "@/lib/site-origin";
import { formatNoteDate } from "../page";

export const dynamic = "force-dynamic";

interface NotePageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { slug } = await params;
  const [note, origin, content] = await Promise.all([
    getNoteDetail(slug),
    getSiteOrigin(),
    getSiteContent(),
  ]);
  if (!note) return { title: "Note not found" };

  const shareImage = note.coverMediaId
    ? { id: note.coverMediaId, alt: note.title }
    : (content.shareImage ?? content.profile.image);

  return {
    metadataBase: new URL(origin),
    title: note.title,
    description: note.summary,
    alternates: { canonical: `/notes/${note.slug}` },
    openGraph: {
      type: "article",
      url: `/notes/${note.slug}`,
      title: note.title,
      description: note.summary,
      // The dates a reader and a crawler both care about: when it was
      // published, and whether it has been revised since.
      publishedTime: note.date,
      modifiedTime: note.updatedAt,
      tags: [...note.tags],
      images: shareImage
        ? [{ url: absoluteMediaUrl(origin, shareImage.id), alt: shareImage.alt }]
        : undefined,
    },
    twitter: {
      card: shareImage ? "summary_large_image" : "summary",
      title: note.title,
      description: note.summary,
      images: shareImage ? [absoluteMediaUrl(origin, shareImage.id)] : undefined,
    },
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { slug } = await params;
  const [note, content] = await Promise.all([
    getNoteDetail(slug),
    getSiteContent(),
  ]);

  // Missing, draft and archived are all 404 — see `getNoteDetail`. A page
  // saying "not published" would confirm the slug exists.
  if (!note) notFound();

  return (
    <>
      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      <main id="main-content" className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/notes"
            className="text-fg-muted underline underline-offset-4 transition-colors duration-150 hover:text-fg"
          >
            Notes
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{note.title}</span>
        </nav>

        <article className="mt-8">
          <time dateTime={note.date} className="font-mono text-xs text-fg-muted">
            {formatNoteDate(note.date)}
          </time>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {note.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
            {note.summary}
          </p>

          {note.tags.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-1.5">
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

          <hr className="my-10 border-subtle" />

          <Markdown body={note.body} />
        </article>

        <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-subtle pt-8">
          <ShareButton title={note.title} label="Share this note" />
          <Link
            href="/notes"
            className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
          >
            All notes
          </Link>
        </div>
      </main>

      <SiteFooter
        siteName={content.siteName}
        note={content.footerNote}
        socials={content.socials}
      />
    </>
  );
}
