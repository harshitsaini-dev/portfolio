/**
 * Every published project, on one page.
 *
 * ## Why this exists
 *
 * The site had project *detail* pages and no list. So a visitor who opened one
 * from the home page's carousel had nowhere to go but back, and a search
 * engine had no single page that says "this is the work" — the home page's
 * carousel is one section among many, and a crawler weights it accordingly.
 *
 * It is also the page worth linking from a CV or an application, where "see my
 * projects" should land on the projects rather than on a scroll position.
 *
 * ## A list, not a second carousel
 *
 * The home page's carousel is deliberately selective and interactive. This is
 * the opposite: everything, in order, in a grid that reflows to one column and
 * needs no interaction to read. Two different jobs, so two different layouts —
 * reusing the carousel here would mean paging through work one card at a time.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { ContentImage } from "@/components/ui/content-image";
import { EmptyState, EmptyStateElsewhere } from "@/components/ui/empty-state";
import { ShareButton } from "@/components/ui/share-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSiteContent } from "@/lib/content/site-content";
import { absoluteMediaUrl, getSiteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [content, origin] = await Promise.all([getSiteContent(), getSiteOrigin()]);
  const title = `Projects · ${content.siteName}`;
  const description = `Work by ${content.profile.name} — ${content.projects.length} published ${
    content.projects.length === 1 ? "project" : "projects"
  }.`;
  const shareImage =
    content.projects[0]?.cover ?? content.shareImage ?? content.profile.image;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: "/projects" },
    openGraph: {
      type: "website",
      url: "/projects",
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

export default async function ProjectsIndexPage() {
  const content = await getSiteContent();
  const { projects } = content;

  return (
    <>
      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      <main id="main-content" className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Projects
            </h1>
            <p className="mt-3 max-w-2xl text-fg-muted">
              {projects.length === 0
                ? // See the empty state below; this line stays for the count.
                  ""
                : `${projects.length} published ${projects.length === 1 ? "project" : "projects"}.`}
            </p>
          </div>
          <ShareButton title={`Projects · ${content.siteName}`} />
        </div>

        {projects.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              title="Nothing published here yet"
              action={<EmptyStateElsewhere socials={content.socials} />}
            >
              Work marked draft or archived in the CMS is deliberately not
              shown. There is more in the pipeline — check back soon.
            </EmptyState>
          </div>
        ) : null}

        {projects.length > 0 ? (
          <ul className="mt-12 grid gap-8 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.slug}>
                <article className="group h-full overflow-hidden rounded-lg border border-subtle bg-surface transition-colors hover:border-accent/50">
                  <Link
                    href={`/projects/${project.slug}`}
                    /*
                      One link wrapping the whole card rather than a link per
                      element. A card with three separate links to the same
                      place is three stops for a keyboard user and three
                      identical announcements for a screen reader.
                    */
                    className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {project.cover ? (
                      <ContentImage
                        image={project.cover}
                        fluid
                        className="aspect-[16/9]"
                        decorative
                      />
                    ) : null}

                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-mono text-xs text-fg-muted">
                        {project.year}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-fg">
                        {project.title}
                      </h2>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">
                        {project.summary}
                      </p>

                      {project.technologies.length > 0 ? (
                        <ul className="mt-4 flex flex-wrap gap-1.5">
                          {project.technologies.map((technology) => (
                            <li
                              key={technology}
                              className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-fg-muted"
                            >
                              {technology}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </main>

      <SiteFooter
        siteName={content.siteName}
        note={content.footerNote}
        socials={content.socials}
      />
    </>
  );
}
