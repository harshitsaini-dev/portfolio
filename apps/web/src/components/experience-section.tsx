import { Section } from "@/components/section";
import { ContentImage } from "@/components/ui/content-image";
import { type } from "@/components/ui/typography";
import type { TimelineEntry } from "@/data/types";

export function ExperienceSection({
  timeline,
}: {
  timeline: readonly TimelineEntry[];
}) {
  return (
    <Section id="experience" eyebrow="Career" title="Experience">
      {timeline.length === 0 ? (
        <p className={type.bodySm}>No experience has been published yet.</p>
      ) : null}

      <ol className="space-y-10 border-l border-subtle pl-6 sm:pl-8">
        {timeline.map((entry) => {
          const headingId = `${entry.id}-heading`;

          return (
            <li key={entry.id} className="relative">
              {/* Timeline node. Decorative — the ordered list already conveys
                  sequence to assistive technology. */}
              <span
                aria-hidden="true"
                className="absolute -left-[calc(1.5rem+3.5px)] top-2 size-1.75 rounded-full bg-strong sm:-left-[calc(2rem+3.5px)]"
              />
              <article aria-labelledby={headingId}>
                <p className={type.meta}>{entry.period}</p>
                <h3 id={headingId} className={`mt-1.5 ${type.subheading}`}>
                  {entry.role}
                </h3>
                <p className="mt-0.5 flex items-center gap-2.5 text-sm font-medium text-accent">
                  {/* Decorative: the organisation name is the same text. */}
                  {entry.image ? (
                    <ContentImage image={entry.image} size={20} decorative />
                  ) : null}
                  {entry.organization}
                </p>
                <p className={`mt-3 max-w-2xl ${type.bodySm}`}>{entry.summary}</p>
                {entry.highlights.length > 0 ? (
                  <ul
                    className={`mt-3 max-w-2xl list-disc space-y-1.5 pl-5 ${type.bodySm}`}
                  >
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
