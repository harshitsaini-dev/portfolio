import { Section } from "@/components/section";
import { TagList } from "@/components/tag-list";
import type { SkillCategory, Tool } from "@/data/types";

interface SkillsSectionProps {
  skillCategories: readonly SkillCategory[];
  tools: readonly Tool[];
}

/**
 * Skills and tools share one section: both answer "what does this person
 * work with", and separating them produced two thin sections with no
 * meaningful distinction for the reader. Each keeps its own <h3>.
 */
export function SkillsSection({ skillCategories, tools }: SkillsSectionProps) {
  return (
    <Section id="skills" title="Skills & tools">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {skillCategories.map((category) => {
          const headingId = `${category.id}-heading`;

          return (
            <article key={category.id} aria-labelledby={headingId}>
              <h3 id={headingId} className="text-base font-semibold">
                {category.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {category.description}
              </p>
              <div className="mt-4">
                <TagList items={category.skills} label={`${category.name} skills`} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-12">
        <h3 className="text-base font-semibold">Tools</h3>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div key={tool.id} className="flex flex-wrap gap-x-2 text-sm">
              <dt className="font-medium">{tool.name}</dt>
              <dd className="text-muted">{tool.purpose}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
