import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { Certification, EducationEntry } from "@/data/types";

interface EducationSectionProps {
  education: readonly EducationEntry[];
  certifications: readonly Certification[];
}

/**
 * Education and certifications share one section. They answer the same
 * question for the reader, and splitting them produced two very short
 * sections competing for the same place in the page rhythm. Each keeps its
 * own `<h3>`.
 */
export function EducationSection({
  education,
  certifications,
}: EducationSectionProps) {
  return (
    <Section
      id="education"
      eyebrow="Background"
      title="Education & certifications"
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <div>
          <h3 className={type.minorHeading}>Education</h3>
          <ol className="mt-6 space-y-8">
            {education.map((entry) => {
              const headingId = `${entry.id}-heading`;

              return (
                <li key={entry.id}>
                  <article aria-labelledby={headingId}>
                    <p className={type.meta}>{entry.period}</p>
                    <h4
                      id={headingId}
                      className="mt-1.5 font-semibold tracking-tight text-fg"
                    >
                      {entry.qualification}
                    </h4>
                    <p className="mt-0.5 text-sm font-medium text-accent">
                      {entry.institution}
                    </p>
                    <p className={`mt-2.5 ${type.bodySm}`}>{entry.summary}</p>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h3 className={type.minorHeading}>Certifications</h3>
          <ul className="mt-6 space-y-4">
            {certifications.map((certification) => {
              const headingId = `${certification.id}-heading`;

              return (
                <li key={certification.id}>
                  <Surface as="article" aria-labelledby={headingId}>
                    <p className={type.meta}>Issued {certification.issued}</p>
                    <h4
                      id={headingId}
                      className="mt-1.5 font-semibold tracking-tight text-fg"
                    >
                      {certification.title}
                    </h4>
                    <p className="mt-0.5 text-sm font-medium text-accent">
                      {certification.issuer}
                    </p>
                    <div className="mt-4">
                      <PlaceholderAction
                        action={certification.credential}
                        context={certification.id}
                      />
                    </div>
                  </Surface>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Section>
  );
}
