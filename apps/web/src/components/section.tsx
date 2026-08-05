import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { type } from "@/components/ui/typography";

interface SectionProps {
  /** Anchor target — must match the navigation item pointing at this section. */
  id: string;
  /** Short label above the heading. The one place accent colour appears in body sections. */
  eyebrow: string;
  title: string;
  /** Optional lead paragraph under the section heading. */
  lead?: string;
  children: ReactNode;
}

/**
 * A titled page section: consistent container, vertical rhythm, heading
 * level, and separator.
 *
 * Every section renders an `<h2>`, keeping the heading hierarchy flat and
 * predictable beneath the single `<h1>` in the hero. Sections are separated
 * by a hairline rule rather than alternating background bands — banding at
 * this content density reads as busy.
 */
export function Section({ id, eyebrow, title, lead, children }: SectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="border-t border-subtle py-20 sm:py-24"
    >
      <Container>
        <p className={type.eyebrow}>{eyebrow}</p>
        <h2 id={headingId} className={`mt-3 ${type.heading}`}>
          {title}
        </h2>
        {lead ? (
          <p className={`mt-4 max-w-2xl ${type.body}`}>{lead}</p>
        ) : null}
        <div className="mt-10 sm:mt-12">{children}</div>
      </Container>
    </section>
  );
}
