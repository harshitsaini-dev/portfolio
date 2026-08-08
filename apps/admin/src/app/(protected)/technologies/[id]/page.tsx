import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateTechnologyAction } from "@/lib/actions/technologies";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import { DeleteTechnologyForm } from "@/components/technologies/delete-technology-form";
import { TechnologyForm } from "@/components/technologies/technology-form";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the technology to show its
 * name, and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it. The tab says "Edit technology".
 */
export const metadata: Metadata = {
  title: "Edit technology · Portfolio Admin",
};

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const technology = await repos.technologies.getById(id);
    if (!technology) notFound();

    const mediaOptions = await getMediaOptions();

    // Whether this technology is still tagged on projects decides what the
    // delete section can offer. The count comes from the projects aggregate,
    // which owns `project_technologies`. The schema's ON DELETE RESTRICT is
    // the authority; this only lets the UI say so before the attempt, and a
    // racing tag added after this read is still caught by the database.
    const usage = await repos.projects.countByTechnology();
    const usageCount = usage[technology.id] ?? 0;

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/technologies"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Technologies
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{technology.name}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          Edit technology
        </h1>

        <TechnologyForm
          action={updateTechnologyAction}
          technologyId={technology.id}
          submitLabel="Save changes"
          initialValues={{
            name: technology.name,
            slug: technology.slug,
            category: technology.category ?? "",
            iconMediaId: technology.iconMediaId ?? "",
          }}
          mediaOptions={mediaOptions}
        />

        <section
          aria-labelledby="danger-zone"
          className="mt-14 rounded-lg border border-danger/40 bg-surface p-6"
        >
          <h2
            id="danger-zone"
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            Delete technology
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            Permanently removes this technology. Projects are never deleted
            with it — a technology still tagged on a project cannot be removed
            until it is detached from every one of them.
          </p>
          <DeleteTechnologyForm
            technologyId={technology.id}
            technologyName={technology.name}
            usageCount={usageCount}
          />
        </section>
      </div>
    );
  },
);
