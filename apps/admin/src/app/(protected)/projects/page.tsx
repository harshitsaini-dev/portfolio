import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { ProjectStatusBadge } from "@/components/projects/status-badge";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading project data. Phase 6
 * established that route metadata is evaluated independently of the
 * component, so `withAdminPage` cannot protect it — a metadata function
 * that read a record would leak it to unauthenticated requests. A page
 * title is not worth that risk.
 */
export const metadata: Metadata = {
  title: "Projects · Portfolio Admin",
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // No status filter: the CMS list is the admin view and shows everything,
  // including drafts and archived work.
  const projects = await repos.projects.list();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Content
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Projects
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {projects.length === 0
              ? "No projects yet."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}, in display order.`}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-strong bg-surface p-10 text-center">
          <h2 className="text-base font-semibold text-fg">
            Nothing here yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
            Projects you create appear here. Drafts stay private until you
            publish them.
          </p>
          <Link
            href="/projects/new"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90"
          >
            Create the first project
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              All projects, ordered by display position
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Title</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Slug</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Position</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Updated</th>
                <th scope="col" className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-subtle">
                  <th scope="row" className="py-3 pr-4 font-medium text-fg">
                    {project.title}
                    {project.isFeatured ? (
                      <span className="ml-2 rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Featured
                      </span>
                    ) : null}
                  </th>
                  <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                    {project.slug}
                  </td>
                  <td className="py-3 pr-4">
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td className="py-3 pr-4 text-fg-muted">{project.position}</td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {formatDate(project.updatedAt)}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/projects/${project.id}`}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted"
                    >
                      Edit
                      <span className="sr-only"> {project.title}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
