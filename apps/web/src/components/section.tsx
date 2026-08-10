import type { ReactNode } from "react";

import { Container } from "@/components/ui/container";
import { ContentImage } from "@/components/ui/content-image";
import type { ContentImage as ContentImageModel } from "@/data/types";
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
   * Alternative phrasings the eyebrow rotates through, in order.
   *
   * The eyebrow only — see the heading below for why it does not rotate. The
   * list does not repeat `eyebrow` itself, which is the canonical first
   * phrase. Defaulted to empty, so a section with none behaves as before.
   */
  eyebrowAlternates?: readonly string[];
  /**
   * A decorative marker rendered before the eyebrow.
   *
   * Hidden from assistive technology: the eyebrow and heading beside it
   * already name the section, and announcing the emoji as well turns
   * "Projects" into "rocket Projects".
   */
  marker?: string;
  /**
   * The editor's icon for this section, when one is set in the CMS.
   *
   * Replaces `marker` rather than joining it: two marks before one heading is
   * noise, and choosing an icon is the editor saying which one they want.
   * Decorative either way — the heading beside it already names the section,
   * so this is `aria-hidden` and carries no alt text.
   */
  icon?: ContentImageModel | null;
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
  lead,
  marker,
  icon,
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
          {icon ? (
            <span aria-hidden="true" className="inline-flex">
              <ContentImage image={icon} size={18} decorative />
            </span>
          ) : marker ? (
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
        {/*
          The heading never rotates.

          It was briefly wired to, and the owner cut it on sight: a section
          heading is the thing you scan a page by, and one that retypes itself
          every few seconds turns the page's structure into motion. The eyebrow
          above it is decorative and can afford that; this cannot. It keeps the
          one-shot scramble it has always had.
        */}
        <h2 id={headingId} className={`reveal mt-3 ${type.heading} weight-hover weight-scroll`}>
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
