"use client";

/**
 * The projects, as a 3D slideshow.
 *
 * All of the behaviour lives in `Carousel3D` — this names what is being shown
 * and how to draw one card. It was one file until the skills section wanted
 * the same arrangement; the split is what stops there being two carousels.
 */

import { Carousel3D } from "@/components/ui/carousel-3d";
import { ProjectCard } from "@/components/project-card";
import type { Project } from "@/data/types";

export function ProjectsCarousel({ projects }: { projects: readonly Project[] }) {
  return (
    <Carousel3D
      items={projects}
      getKey={(project) => project.slug}
      renderItem={(project) => <ProjectCard project={project} />}
      label="Projects"
      itemNoun="project"
    />
  );
}
