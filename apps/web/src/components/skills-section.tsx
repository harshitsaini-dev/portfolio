import { Section } from "@/components/section";
import { BadgeList } from "@/components/ui/badge";
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
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {skillCategories.map((category) => {
          const headingId = `${category.id}-heading`;

          return (
            <li key={category.id}>
              <Surface as="article" aria-labelledby={headingId} className="h-full">
                <h3 id={headingId} className={type.subheading}>
                  {category.name}
                </h3>
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
        <dl className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="flex items-baseline justify-between gap-4 border-b border-subtle pb-3"
            >
              <dt className="text-sm font-medium text-fg">{tool.name}</dt>
              <dd className={`text-right ${type.fine}`}>{tool.purpose}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
