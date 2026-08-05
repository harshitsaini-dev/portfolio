import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import { TagList } from "@/components/tag-list";
import type { Project } from "@/data/types";

function ProjectCard({ project }: { project: Project }) {
  const headingId = `project-${project.slug}-heading`;

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id={headingId} className="text-lg font-semibold">
            {project.title}
          </h3>
          <p className="text-sm text-muted">{project.year}</p>
        </div>

        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
          {project.summary}
        </p>

        <div className="mt-5">
          <TagList
            items={project.technologies}
            label={`Technologies used in ${project.title}`}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-start gap-3">
          <PlaceholderAction
            action={project.repository}
            context={`${project.slug}-repository`}
          />
          <PlaceholderAction
            action={project.liveSite}
            context={`${project.slug}-live`}
          />
        </div>
      </article>
    </li>
  );
}

export function ProjectsSection({ projects }: { projects: readonly Project[] }) {
  return (
    <Section
      id="projects"
      title="Projects"
      lead="Placeholder projects used to establish the layout. Real projects are managed through the CMS in a later phase."
    >
      <ul className="grid gap-6 sm:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </ul>
    </Section>
  );
}
