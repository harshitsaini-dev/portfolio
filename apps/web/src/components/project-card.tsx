import Link from "next/link";

import { PlaceholderAction } from "@/components/placeholder-action";
import { BadgeList } from "@/components/ui/badge";
import { ContentImage } from "@/components/ui/content-image";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { Project } from "@/data/types";

/**
 * One project, as a card.
 *
 * Lifted out of `projects-section.tsx` so the grid and the carousel render
 * exactly the same card. Two copies would drift, and the carousel exists to
 * change how cards are *arranged*, not what they contain.
 *
 * Deliberately not a client component. It has no state and no handlers, so it
 * renders on the server inside the grid and is pulled into the client bundle
 * only by the carousel that imports it.
 */
export function ProjectCard({ project }: { project: Project }) {
  const headingId = `project-${project.slug}-heading`;

  return (
    <Surface
      as="article"
      aria-labelledby={headingId}
      padded={false}
      glass
      interactive
      /*
        The bespoke hover here — a translate, a border and a shadow — is gone
        in favour of the shared one. Three components each inventing their own
        hover is how a site ends up with three hover languages.
      */
      className="reveal group flex h-full flex-col overflow-hidden"
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
            <h3 id={headingId} className={`glow-title ${type.subheading}`}>
              <Link
                href={`/projects/${project.slug}`}
                // `inline-block` with a little vertical padding, so the target
                // clears the 24px WCAG 2.5.8 minimum. It measured 23px — one
                // pixel short, which is the kind of thing only a measurement
                // finds. An inline element ignores vertical padding for
                // hit-testing, hence the display change rather than padding
                // alone.
                className="inline-block py-0.5 transition-colors duration-150 hover:text-accent"
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
  );
}
