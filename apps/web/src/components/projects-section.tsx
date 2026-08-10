import { ProjectsCarousel } from "@/components/projects-carousel";
import { Section } from "@/components/section";
import { type } from "@/components/ui/typography";
import type { Project } from "@/data/types";
import type { SectionCopy } from "@/lib/content/sections";

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
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
    >
      {projects.length === 0 ? (
        <p className={type.bodySm}>
          No published projects yet. Projects marked draft or archived in the
          CMS are deliberately not shown here.
        </p>
      ) : null}

      {/* The carousel renders the same cards in the same list. It arranges
          them in 3D only when JavaScript is running, motion is welcome, and
          the viewport is wide enough — otherwise this is the two-column grid
          it has always been. */}
      <ProjectsCarousel projects={projects} />
    </Section>
  );
}
