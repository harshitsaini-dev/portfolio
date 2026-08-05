import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import { BadgeList } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { Project } from "@/data/types";

function ProjectCard({ project }: { project: Project }) {
  const headingId = `project-${project.slug}-heading`;

  return (
    <li>
      <Surface as="article" aria-labelledby={headingId} className="flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id={headingId} className={type.subheading}>
            {project.title}
          </h3>
          <p className={`shrink-0 ${type.meta}`}>{project.year}</p>
        </div>

        <p className={`mt-3 ${type.bodySm}`}>{project.summary}</p>

        {/* Pushes the tags and actions to the card foot so cards of differing
            summary length still align along their bottom edge. */}
        <div className="mt-auto pt-6">
          <BadgeList
            items={project.technologies}
            label={`Technologies used in ${project.title}`}
          />
          <div className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
            <PlaceholderAction
              action={project.repository}
              context={`${project.slug}-repository`}
            />
            <PlaceholderAction
              action={project.liveSite}
              context={`${project.slug}-live`}
            />
          </div>
        </div>
      </Surface>
    </li>
  );
}

export function ProjectsSection({ projects }: { projects: readonly Project[] }) {
  return (
    <Section
      id="projects"
      eyebrow="Selected work"
      title="Projects"
      lead="Placeholder projects used to establish the layout. Real projects are managed through the CMS in a later phase."
    >
      {/* Two columns from the tablet breakpoint up. Below that a single
          column keeps the summary and its two actions readable. */}
      <ul className="grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </ul>
    </Section>
  );
}
