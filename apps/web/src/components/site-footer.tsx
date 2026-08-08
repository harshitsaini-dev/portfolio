import { Container } from "@/components/ui/container";
import { SocialRow } from "@/components/ui/social-row";
import { type } from "@/components/ui/typography";
import type { SocialProfile } from "@/data/types";

interface SiteFooterProps {
  siteName: string;
  note: string;
  socials: readonly SocialProfile[];
}

/**
 * The footer repeats the social links from the hero.
 *
 * Deliberate duplication, not an oversight: a visitor who has read to the
 * bottom of the page should not have to scroll back up to find where else to
 * follow the work. The two rows are given different accessible names so a
 * screen reader's landmark list distinguishes them.
 */
export function SiteFooter({ siteName, note, socials }: SiteFooterProps) {
  return (
    <footer className="border-t border-subtle py-12">
      <Container className="flex flex-col gap-8">
        {socials.length > 0 ? (
          <SocialRow socials={socials} label="Profiles elsewhere, in the footer" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`max-w-2xl ${type.fine}`}>{note}</p>
          <p className="text-sm font-semibold tracking-tight text-fg">
            {siteName}
          </p>
        </div>
      </Container>
    </footer>
  );
}
