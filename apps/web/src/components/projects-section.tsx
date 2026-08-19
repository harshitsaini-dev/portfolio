import Link from "next/link";

import { EmptyState, EmptyStateElsewhere } from "@/components/ui/empty-state";
import { ProjectsCarousel } from "@/components/projects-carousel";
import { Section } from "@/components/section";
import type { Project, SocialProfile } from "@/data/types";
import type { SectionCopy } from "@/lib/content/sections";

/**
 * How many projects the home page shows before sending people to the full list.
 *
 * The section had no limit, which was invisible at nine projects and would not
 * be at fifty: the carousel shows one card at a time but still renders every
 * one of them, and below `md` it is not a carousel at all — it is a plain
 * grid, so a phone would have received fifty cards and every image with them.
 *
 * Six is three rows of two in that grid, and it is the newest six because the
 * list arrives ordered. `/projects` already existed as the page that lists
 * everything, so nothing is lost by the home page being a selection — which is
 * what "View all projects" underneath has been promising all along.
 */
const HOME_COUNT = 6;

export function ProjectsSection({
  projects,
  copy,
  socials,
}: {
  projects: readonly Project[];
  copy: SectionCopy;
  /** Only used when the section is empty, to offer somewhere else to look. */
  socials: readonly SocialProfile[];
}) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
      accent={copy.accent}
    >
      {projects.length === 0 ? (
        <EmptyState
          title="Nothing published here yet"
          action={<EmptyStateElsewhere socials={socials} />}
        >
          Work marked draft or archived in the CMS is deliberately not shown.
          There is more in the pipeline — check back soon.
        </EmptyState>
      ) : null}

      {/* The carousel renders the same cards in the same list. It arranges
          them in 3D only when JavaScript is running, motion is welcome, and
          the viewport is wide enough — otherwise this is the two-column grid
          it has always been. */}
      <ProjectsCarousel projects={projects.slice(0, HOME_COUNT)} />

      {/* The carousel is selective and interactive; this is the way to the
          page that simply lists everything. Only shown when there is a list
          worth going to. */}
      {projects.length > 0 ? (
        <p className="mt-10">
          <Link
            href="/projects"
            className="text-sm font-medium text-accent underline underline-offset-4 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View all projects
            {projects.length > HOME_COUNT ? (
              // The number is the reason to press it. Without it, somebody
              // looking at six cards has no way to know there are fifty.
              <span className="text-fg-muted"> ({projects.length})</span>
            ) : null}
          </Link>
        </p>
      ) : null}
    </Section>
  );
}
