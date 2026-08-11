import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BadgeList } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { ContentImage } from "@/components/ui/content-image";
import { actionVariant } from "@/components/ui/action";
import { type } from "@/components/ui/typography";
import { getProjectDetail } from "@/lib/content/project-detail";
import { ShareButton } from "@/components/ui/share-button";
import { absoluteMediaUrl, getSiteOrigin } from "@/lib/site-origin";
import { accentCustomProperties } from "@portfolio/ui";

import { getSiteContent } from "@/lib/content/site-content";

/**
 * A project's case-study page.
 *
 * Rendered per request for the same reason the home page is: the point of a
 * CMS is that an edit appears without a deployment.
 */
export const dynamic = "force-dynamic";

/**
 * Page metadata from the project itself.
 *
 * Safe to read here, unlike in the admin: this content is public by
 * definition — `getProjectDetail` returns `null` for anything not published,
 * so an unpublished title cannot reach a `<title>` tag. The admin's rule
 * about metadata bypassing route protection does not apply to a page that
 * has no protection to bypass.
 */
export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [project, origin] = await Promise.all([
    getProjectDetail(slug),
    getSiteOrigin(),
  ]);
  if (!project) return { title: "Project not found" };

  // The cover if there is one, the first gallery image otherwise. A project
  // shared without a picture is a wall of text in every preview, and both of
  // these are images the editor already chose for this project — neither is a
  // guess, and the gallery's first item is the one the page leads with.
  const shareImage = project.cover ?? project.gallery[0]?.image ?? null;

  return {
    metadataBase: new URL(origin),
    title: project.title,
    description: project.summary,
    // Points at the slug, not at whatever URL the visitor arrived on. A
    // project reached with a campaign query is the same project.
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      // `article` rather than `website`: this is one piece of work with a
      // subject, and the distinction is what a reader-mode or a preview card
      // uses to decide it is showing a thing rather than a site.
      type: "article",
      url: `/projects/${project.slug}`,
      title: project.title,
      description: project.summary,
      images: shareImage
        ? [
            {
              url: absoluteMediaUrl(origin, shareImage.id),
              width: shareImage.width ?? undefined,
              height: shareImage.height ?? undefined,
              alt: shareImage.alt,
            },
          ]
        : undefined,
    },
    twitter: {
      card: shareImage ? "summary_large_image" : "summary",
      title: project.title,
      description: project.summary,
      images: shareImage ? [absoluteMediaUrl(origin, shareImage.id)] : undefined,
    },
  };
}

/**
 * One part of the case study.
 *
 * Renders nothing when the editor did not write this part — the caller does
 * not have to guard each of the three, and a heading can never appear with no
 * text under it.
 *
 * `h2`, so the page keeps a single heading level under its `h1` and a screen
 * reader's heading list reads as the case study's outline.
 */
function CaseStudyPart({
  heading,
  paragraphs,
}: {
  heading: string;
  paragraphs: readonly string[];
}) {
  if (paragraphs.length === 0) return null;
  return (
    <section className="mt-12 max-w-2xl">
      <h2 className={type.minorHeading}>{heading}</h2>
      <div className={`mt-5 space-y-5 ${type.body}`}>
        {paragraphs.map((paragraph, index) => (
          // Paragraph order is fixed and never reordered or filtered, so the
          // index is a stable key.
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const [project, content] = await Promise.all([
    getProjectDetail(slug),
    // The header and footer are site-wide, so this page needs the same
    // profile-derived name and navigation the home page uses.
    getSiteContent(),
  ]);

  // Missing, draft and archived are all 404 — see `getProjectDetail`. A page
  // saying "not published" would confirm the slug exists.
  if (!project) notFound();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:absolute focus:left-5 focus:top-4 focus:z-30"
      >
        Skip to main content
      </a>

      <SiteHeader siteName={content.siteName} navigation={content.navigation} />

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1"
        /* This project's own accent, scoped to the page body — see the note
           route for the same reasoning. */
        style={project.accent ? accentCustomProperties(project.accent) : undefined}
      >
        <article>
          <Container className="py-16 sm:py-20">
            <nav aria-label="Breadcrumb" className="text-sm">
              <Link
                // Points at the list page now that one exists. It used to be
                // `/#projects`, a scroll position on the home page — which is a
                // worse answer to "up one level" than a page whose subject is
                // exactly this.
                href="/projects"
                // Underlined, because within this row the link is otherwise
                // told apart from the plain text beside it by colour alone —
                // measured at 2.54:1 against it, under the 3:1 WCAG 1.4.1
                // requires when colour is the only distinction. An underline
                // removes the dependency on colour entirely rather than
                // chasing a ratio that would still fail for anyone who cannot
                // separate the two hues.
                className="underline underline-offset-4 text-fg-muted transition-colors duration-150 hover:text-fg"
              >
                Projects
              </Link>
              <span aria-hidden="true" className="mx-2 text-fg-muted">
                /
              </span>
              <span className="text-fg">{project.title}</span>
            </nav>

            {project.period ? (
              <p className={`mt-8 ${type.meta}`}>{project.period}</p>
            ) : null}

            <h1 className={`mt-3 ${type.display}`}>{project.title}</h1>
            <p className={`mt-6 max-w-2xl ${type.lead}`}>{project.summary}</p>

            <div className="mt-10">
              <ShareButton title={project.title} label="Share this project" />
            </div>

            {project.links.length > 0 ? (
              <div className="mt-10 flex flex-wrap items-start gap-4">
                {project.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    // Editor-supplied destinations point off-site. `noopener`
                    // denies the opened page a handle on this one; `noreferrer`
                    // keeps this site's URL out of its logs.
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors duration-150 ${actionVariant.quiet}`}
                  >
                    {link.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            ) : null}

            {project.cover ? (
              <div className="mt-12">
                <ContentImage
                  image={project.cover}
                  fluid
                  radius="rounded-lg"
                  className="border border-subtle"
                />
              </div>
            ) : null}

            {project.description.length > 0 ? (
              <div className={`mt-12 max-w-2xl space-y-5 ${type.body}`}>
                {project.description.map((paragraph, index) => (
                  // Paragraph order is fixed and never reordered or filtered,
                  // so the index is a stable key.
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : null}

            {/*
              The case study, in the order someone evaluating the work asks the
              questions: what was wrong, what you built, what you built it
              with, and what it taught you. The stack sits in the middle
              because it belongs to the answer, not to the epilogue — which is
              why the three prose parts are rendered here individually rather
              than mapped in one loop around it.

              Every part is optional and independent: a project can answer only
              the problem, or only the learnings, and the page skips the rest
              without leaving an empty heading behind.
            */}
            <CaseStudyPart
              heading="The problem"
              paragraphs={project.caseStudy.problem}
            />
            <CaseStudyPart
              heading="What I built"
              paragraphs={project.caseStudy.solution}
            />

            {project.technologies.length > 0 ? (
              <div className="mt-12">
                <h2 className={type.minorHeading}>Built with</h2>
                <div className="mt-5">
                  <BadgeList
                    items={project.technologies}
                    label={`Technologies used in ${project.title}`}
                  />
                </div>
              </div>
            ) : null}

            <CaseStudyPart
              heading="What I learned"
              paragraphs={project.caseStudy.learnings}
            />

            {project.gallery.length > 0 ? (
              <div className="mt-14">
                <h2 className={type.minorHeading}>Gallery</h2>
                <ul className="mt-6 grid gap-8 sm:grid-cols-2">
                  {project.gallery.map((item) => (
                    <li key={item.image.id}>
                      <figure>
                        <ContentImage
                          image={item.image}
                          fluid
                          radius="rounded-lg"
                          className="border border-subtle"
                        />
                        {item.caption ? (
                          <figcaption className={`mt-3 ${type.fine}`}>
                            {item.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Container>
        </article>
      </main>

      <SiteFooter
        siteName={content.siteName}
        note={content.footerNote}
        socials={content.socials}
      />
    </>
  );
}
