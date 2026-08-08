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
  const project = await getProjectDetail(slug);
  if (!project) return { title: "Project not found" };
  return {
    title: project.title,
    description: project.summary,
  };
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

      <main id="main-content" tabIndex={-1} className="flex-1">
        <article>
          <Container className="py-16 sm:py-20">
            <nav aria-label="Breadcrumb" className="text-sm">
              <Link
                href="/#projects"
                className="text-fg-muted transition-colors duration-150 hover:text-fg"
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
