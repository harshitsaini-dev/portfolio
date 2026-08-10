import { ContributionPlayground } from "@/components/playground/contribution-playground";
import { Section } from "@/components/section";
import type { SectionCopy } from "@/lib/content/sections";

/**
 * The playground's section wrapper.
 *
 * Thin on purpose: every other section is a wrapper around content read from
 * the CMS, and this one is a wrapper around a toy that reads nothing. Keeping
 * the shape identical means the section ordering, retitling and hiding an
 * editor already understands applies here too, with no special case in the
 * page's switch.
 */
export function PlaygroundSection({ copy }: { copy: SectionCopy }) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
    >
      <ContributionPlayground />
    </Section>
  );
}
