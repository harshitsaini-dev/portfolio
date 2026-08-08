import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { ScrambleText } from "@/components/ui/scramble-text";
import { Typewriter } from "@/components/ui/typewriter";
import { type } from "@/components/ui/typography";

interface SectionProps {
  /** Anchor target — must match the navigation item pointing at this section. */
  id: string;
  /** Short label above the heading. The one place accent colour appears in body sections. */
  eyebrow: string;
  /**
   * A decorative marker rendered before the eyebrow.
   *
   * Hidden from assistive technology: the eyebrow and heading beside it
   * already name the section, and announcing the emoji as well turns
   * "Projects" into "rocket Projects".
   */
  marker?: string;
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
export function Section({
  id,
  eyebrow,
  title,
  lead,
  marker,
  children,
}: SectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      /*
        No top border. The 3D layer is fixed behind the page, so a hairline
        rule drew a line straight across the figure — reported as exactly
        that. Spacing separates the sections without putting a stroke over
        the background.
      */
      className="py-24 sm:py-32"
    >
      <Container>
        {/* The heading block reveals as one unit. The section body is a
            separate reveal so a long list does not animate as a slab. */}
        <p className={`reveal flex items-center gap-2 ${type.eyebrow}`}>
          {marker ? (
            <span aria-hidden="true" className="text-base leading-none">
              {marker}
            </span>
          ) : null}
          <Typewriter text={eyebrow} />
        </p>
        {/* The heading resolves out of random characters as it scrolls in.
            The real string is always in the DOM — see `ScrambleText`. */}
        <h2 id={headingId} className={`reveal mt-3 ${type.heading}`}>
          <ScrambleText text={title} />
        </h2>
        {lead ? (
          <p className={`mt-4 max-w-2xl ${type.body}`}>{lead}</p>
        ) : null}
        <div className="reveal-2 reveal mt-10 sm:mt-12">{children}</div>
      </Container>
    </section>
  );
}
