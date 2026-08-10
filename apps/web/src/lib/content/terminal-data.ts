import "server-only";

/**
 * Turns site content into the shape the terminal answers questions from.
 *
 * Extracted the moment a second route needed it. The home page's inline
 * terminal and the full-page one at `/terminal` must answer identically — two
 * copies of this mapping would be two chances for `whoami` to say something
 * different depending on where it was typed.
 *
 * Nothing is invented here. Every field is content the CMS already holds, so
 * an editor who renames a skill renames it in the terminal too.
 */

import type { SiteContent } from "@/data/types";
import type { TerminalData } from "@/components/ui/command-terminal";

export function buildTerminalData(content: SiteContent): TerminalData {
  return {
    name: content.profile.name,
    role: content.profile.role,
    tagline: content.profile.tagline,
    location: content.profile.location,
    skills: content.skillCategories.map((category) => ({
      name: category.name,
      items: category.skills.map((skill) => skill.name),
    })),
    projects: content.projects.map((project) => ({
      title: project.title,
      slug: project.slug,
      year: project.year,
    })),
    socials: content.socials.map((social) => ({
      label: social.label,
      url: social.url,
    })),
    resumeHref: content.resume?.href ?? null,
  };
}
