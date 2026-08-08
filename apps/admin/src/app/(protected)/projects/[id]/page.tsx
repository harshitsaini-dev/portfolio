import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateProjectAction } from "@/lib/actions/projects";
import { withAdminPage } from "@/lib/auth/protected-page";
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

    // The repository exposes `getBySlugWithRelations` but not an id
    // equivalent, so relations are composed here from its existing methods
    // rather than widening the public API for one caller. Three bounded
    // queries, not N+1.
    const [links, technologies, allTechnologies, projectMedia, allMediaAssets] = await Promise.all([
      repos.projects.listLinks(project.id),
      repos.projects.listTechnologies(project.id),
      repos.technologies.list(),
      repos.projects.listMedia(project.id),
      repos.media.list(),
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
          action={updateProjectAction}
          projectId={project.id}
          technologies={allTechnologies}
          mediaAssets={allMediaAssets}
          submitLabel="Save changes"
          initialValues={{
            title: project.title,
            slug: project.slug,
            summary: project.summary,
            description: project.description ?? "",
            status: project.status,
            isFeatured: project.isFeatured,
            position: project.position,
            periodLabel: project.periodLabel ?? "",
            startedOn: project.startedOn ?? "",
            completedOn: project.completedOn ?? "",
            coverMediaId: project.coverMediaId ?? null,
            links: links.map((link) => ({
              label: link.label,
              url: link.url,
              kind: link.kind,
            })),
            technologyIds: technologies.map((technology) => technology.id),
            media: projectMedia.map((m) => ({
              mediaAssetId: m.mediaAssetId,
              caption: m.caption,
            })),
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
