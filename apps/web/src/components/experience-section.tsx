import { Section } from "@/components/section";
import type { TimelineEntry } from "@/data/types";

export function ExperienceSection({
  timeline,
}: {
  timeline: readonly TimelineEntry[];
}) {
  return (
    <Section id="experience" title="Experience">
      <ol className="space-y-8 border-l border-border pl-6">
        {timeline.map((entry) => {
          const headingId = `${entry.id}-heading`;

          return (
            <li key={entry.id}>
              <article aria-labelledby={headingId}>
                <p className="text-sm text-muted">{entry.period}</p>
                <h3 id={headingId} className="mt-1 text-lg font-semibold">
                  {entry.role}
                </h3>
                <p className="text-sm font-medium text-muted">
                  {entry.organization}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                  {entry.summary}
                </p>
                {entry.highlights.length > 0 ? (
                  <ul className="mt-3 max-w-2xl list-disc space-y-1 pl-5 text-sm text-muted">
                    {entry.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
