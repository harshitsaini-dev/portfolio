import Link from "next/link";

import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import { BadgeList } from "@/components/ui/badge";
import { ContentImage } from "@/components/ui/content-image";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { Project } from "@/data/types";
import type { SectionCopy } from "@/lib/content/sections";

function ProjectCard({ project }: { project: Project }) {
  const headingId = `project-${project.slug}-heading`;

  return (
    <li>
      <Surface
        as="article"
        aria-labelledby={headingId}
        padded={false}
        className="reveal group flex h-full flex-col overflow-hidden transition-[colors,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-md"
      >
        {project.cover ? (
          // Decorative: the title, summary and technologies below say
          // everything this image does, and announcing its alt text here
          // would make a screen reader read the project twice.
          <ContentImage
            image={project.cover}
            fluid
            radius="rounded-none"
            className="aspect-[16/9] border-b border-subtle"
            decorative
          />
        ) : null}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Decorative: the project title is right beside it. */}
            {project.image ? (
              <ContentImage image={project.image} size={32} decorative />
            ) : null}
            <h3 id={headingId} className={type.subheading}>
              <Link
                href={`/projects/${project.slug}`}
                className="transition-colors duration-150 hover:text-accent"
              >
                {project.title}
              </Link>
            </h3>
          </div>
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
      </div>
      </Surface>
    </li>
  );
}

export function ProjectsSection({
  projects,
  copy,
}: {
  projects: readonly Project[];
  copy: SectionCopy;
}) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      title={copy.title}
      marker={copy.marker}
    >
      {projects.length === 0 ? (
        <p className={type.bodySm}>
          No published projects yet. Projects marked draft or archived in the
          CMS are deliberately not shown here.
        </p>
      ) : null}

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
