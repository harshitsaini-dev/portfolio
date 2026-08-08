import type { Metadata } from "next";
import Link from "next/link";

import { createProjectAction } from "@/lib/actions/projects";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getMediaOptions } from "@/lib/media/options";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  ProjectForm,
  emptyProjectValues,
} from "@/components/projects/project-form";

/** Static and generic — see the note in the projects list page. */
export const metadata: Metadata = {
  title: "New project · Portfolio Admin",
};

export default withAdminPage(async () => {
  const mediaOptions = await getMediaOptions();
  const repos = await getAdminRepositories();
  const technologies = await repos.technologies.list();

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
        <span className="text-fg">New</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
        New project
      </h1>

      <ProjectForm
        action={createProjectAction}
        initialValues={emptyProjectValues}
        technologies={technologies}
        mediaOptions={mediaOptions}
        submitLabel="Create project"
      />
    </div>
  );
});
