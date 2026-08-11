import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateProjectAction } from "@/lib/actions/projects";
import { getSiteAccent } from "@/lib/site-accent";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteProjectForm } from "@/components/projects/delete-project-form";
import { ProjectForm } from "@/components/projects/project-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the project to show its
 * title, and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it. That would leak a project title to
 * unauthenticated requests. The tab simply says "Edit project" instead.
 */
export const metadata: Metadata = {
  title: "Edit project · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const project = await repos.projects.getById(id);
    if (!project) notFound();

    const mediaOptions = await getMediaOptions();
    const siteAccent = await getSiteAccent();

    // The repository exposes `getBySlugWithRelations` but not an id
    // equivalent, so relations are composed here from its existing methods
    // rather than widening the public API for one caller. Four bounded
    // queries in parallel, not N+1.
    const [links, technologies, media, allTechnologies] = await Promise.all([
      repos.projects.listLinks(project.id),
      repos.projects.listTechnologies(project.id),
      repos.projects.listMedia(project.id),
      repos.technologies.list(),
    ]);

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/projects"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Projects
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{project.title}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit project
        </h1>

        <ProjectForm
        siteAccent={siteAccent}
          action={updateProjectAction}
          projectId={project.id}
          technologies={allTechnologies}
          mediaOptions={mediaOptions}
          submitLabel="Save changes"
          initialValues={{
            title: project.title,
            slug: project.slug,
            summary: project.summary,
            description: project.description ?? "",
            accent: project.accent ?? "",
            problem: project.problem ?? "",
            solution: project.solution ?? "",
            learnings: project.learnings ?? "",
            status: project.status,
            isFeatured: project.isFeatured,
            position: project.position,
            periodLabel: project.periodLabel ?? "",
            startedOn: project.startedOn ?? "",
            completedOn: project.completedOn ?? "",
            iconMediaId: project.iconMediaId ?? "",
            coverMediaId: project.coverMediaId ?? "",
            links: links.map((link) => ({
              label: link.label,
              url: link.url,
              kind: link.kind,
            })),
            // Already ordered by `position` from the repository, and the form
            // treats row order as the position — so it is never re-sorted
            // here, and saving an untouched project cannot reorder its
            // gallery.
            media: media.map((item) => ({
              mediaAssetId: item.mediaAssetId,
              caption: item.caption ?? "",
            })),
            technologyIds: technologies.map((technology) => technology.id),
          }}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2 id="danger-zone" className="text-sm font-semibold uppercase tracking-wider text-fg">
            Delete project
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this project along with its links, technology
            tags, and media associations. Media files themselves are not
            deleted. This cannot be undone.
          </p>
          <DeleteProjectForm projectId={project.id} projectTitle={project.title} />
        </section>
      </div>
    );
  },
);
