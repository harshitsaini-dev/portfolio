import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { ScrambleText } from "@/components/ui/scramble-text";
import { RotatingTypewriter } from "@/components/ui/rotating-typewriter";
import { Typewriter } from "@/components/ui/typewriter";
import { type } from "@/components/ui/typography";

interface SectionProps {
  /** Anchor target — must match the navigation item pointing at this section. */
  id: string;
  /** Short label above the heading. The one place accent colour appears in body sections. */
  eyebrow: string;
  /**
   * Alternative phrasings the eyebrow and heading rotate through, in order.
   *
   * Neither list repeats the label it belongs to — `eyebrow` and `title` are
   * the canonical first phrases. Defaulted to empty so every existing call
   * site keeps its exact behaviour.
   */
  eyebrowAlternates?: readonly string[];
  titleAlternates?: readonly string[];
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
  eyebrowAlternates = [],
  title,
  titleAlternates = [],
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
          {eyebrowAlternates.length > 0 ? (
            <RotatingTypewriter phrases={[eyebrow, ...eyebrowAlternates]} />
          ) : (
            <Typewriter text={eyebrow} />
          )}
        </p>
        {/* The heading resolves out of random characters as it scrolls in.
            The real string is always in the DOM — see `ScrambleText`. */}
        {/* With alternates the heading types through them; without, it keeps
            the scramble it has always had. Two effects rather than one
            because they answer different questions — scramble is a one-shot
            arrival, rotation is continuous — and forcing rotation to scramble
            would re-announce nothing but look like corruption on a loop. */}
        <h2 id={headingId} className={`reveal mt-3 ${type.heading}`}>
          {titleAlternates.length > 0 ? (
            <RotatingTypewriter phrases={[title, ...titleAlternates]} />
          ) : (
            <ScrambleText text={title} />
          )}
        </h2>
        {lead ? (
          <p className={`mt-4 max-w-2xl ${type.body}`}>{lead}</p>
        ) : null}
        <div className="reveal-2 reveal mt-10 sm:mt-12">{children}</div>
      </Container>
    </section>
  );
}
