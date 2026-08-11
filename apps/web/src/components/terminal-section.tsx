import Link from "next/link";

import { Section } from "@/components/section";
import { CommandTerminal, type TerminalData } from "@/components/ui/command-terminal";
import type { SectionCopy } from "@/lib/content/sections";

/**
 * The terminal, as a section of the home page.
 *
 * ## Why it is not part of the playground any more
 *
 * It was rendered inside the playground's branch, which read well — both are
 * things to poke at — and behaved badly: the CMS could not move, rename or
 * hide one without doing the same to the other, because as far as the section
 * list was concerned they were one section. Anything the owner should be able
 * to order or switch off has to be a section in its own right.
 *
 * ## It remains an enhancement
 *
 * Every command answers with something already on the page or one link away,
 * so a visitor who never types into it misses nothing — which is the rule that
 * lets a section like this exist on a site whose job is to be read.
 */
export function TerminalSection({
  copy,
  data,
}: {
  copy: SectionCopy;
  data: TerminalData;
}) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
      accent={copy.accent}
    >
      <CommandTerminal
        data={data}
        footer={
          <Link
            href="/terminal"
            // `inline-flex min-h-11` rather than a bare text link: it stands
            // alone rather than sitting in a sentence, so it needs a real
            // target instead of the 16px line box it would otherwise be.
            className="inline-flex min-h-11 items-center text-accent underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open terminal mode →
          </Link>
        }
      />
    </Section>
  );
}
