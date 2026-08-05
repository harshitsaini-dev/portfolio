import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import type { Certification, EducationEntry } from "@/data/types";

interface EducationSectionProps {
  education: readonly EducationEntry[];
  certifications: readonly Certification[];
}

/**
 * Education and certifications share one section. They are closely related
 * for the reader, and grouping them avoids two very short sections competing
 * for the same place in the page rhythm. Each still gets its own <h3>.
 */
export function EducationSection({
  education,
  certifications,
}: EducationSectionProps) {
  return (
    <Section id="education" title="Education & certifications">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className="text-base font-semibold">Education</h3>
          <ol className="mt-4 space-y-6">
            {education.map((entry) => {
              const headingId = `${entry.id}-heading`;

              return (
                <li key={entry.id}>
                  <article aria-labelledby={headingId}>
                    <p className="text-sm text-muted">{entry.period}</p>
                    <h4 id={headingId} className="mt-1 font-medium">
                      {entry.qualification}
                    </h4>
                    <p className="text-sm text-muted">{entry.institution}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {entry.summary}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h3 className="text-base font-semibold">Certifications</h3>
          <ul className="mt-4 space-y-6">
            {certifications.map((certification) => {
              const headingId = `${certification.id}-heading`;

              return (
                <li key={certification.id}>
                  <article aria-labelledby={headingId}>
                    <p className="text-sm text-muted">
                      Issued {certification.issued}
                    </p>
                    <h4 id={headingId} className="mt-1 font-medium">
                      {certification.title}
                    </h4>
                    <p className="text-sm text-muted">{certification.issuer}</p>
                    <div className="mt-3">
                      <PlaceholderAction
                        action={certification.credential}
                        context={certification.id}
                      />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Section>
  );
}
