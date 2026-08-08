import { Section } from "@/components/section";
import { BadgeList } from "@/components/ui/badge";
import { ContentImage } from "@/components/ui/content-image";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { SkillCategory, Tool } from "@/data/types";

interface SkillsSectionProps {
  skillCategories: readonly SkillCategory[];
  tools: readonly Tool[];
}

/**
 * Skills and tools share one section: both answer "what does this person work
 * with", and separating them produced two thin sections with no meaningful
 * distinction for the reader. Each keeps its own `<h3>`.
 */
export function SkillsSection({ skillCategories, tools }: SkillsSectionProps) {
  return (
    <Section id="skills" eyebrow="Capabilities" title="Skills & tools">
      {skillCategories.length === 0 ? (
        <p className={type.bodySm}>No skills have been published yet.</p>
      ) : null}

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {skillCategories.map((category) => {
          const headingId = `${category.id}-heading`;

          return (
            <li key={category.id}>
              <Surface as="article" aria-labelledby={headingId} className="h-full">
                <div className="flex items-center gap-3">
                  {/* Decorative: the heading beside it says the same thing. */}
                  {category.image ? (
                    <ContentImage image={category.image} size={32} decorative />
                  ) : null}
                  <h3 id={headingId} className={type.subheading}>
                    {category.name}
                  </h3>
                </div>
                <p className={`mt-2 ${type.bodySm}`}>{category.description}</p>
                <div className="mt-5">
                  <BadgeList
                    items={category.skills}
                    label={`${category.name} skills`}
                  />
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>

      <div className="mt-14">
        <h3 className={type.minorHeading}>Tools</h3>
        {tools.length === 0 ? (
          <p className={`mt-4 ${type.bodySm}`}>
            No tools have been published yet.
          </p>
        ) : null}
        <dl className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between gap-4 border-b border-subtle pb-3"
            >
              <dt className="flex items-center gap-3 text-sm font-medium text-fg">
                {tool.image ? (
                  <ContentImage image={tool.image} size={24} decorative />
                ) : null}
                {tool.name}
              </dt>
              <dd className={`text-right ${type.fine}`}>{tool.purpose}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
