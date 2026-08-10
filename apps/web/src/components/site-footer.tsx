import { IstClock } from "@/components/ui/ist-clock";
import { ShareButton } from "@/components/ui/share-button";
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
    <footer
      /*
        No top border. The 3D layer is fixed behind the page, so a hairline
        rule drew a line straight across the figure — the same reason the
        section dividers went. Spacing separates it instead.
      */
      className="py-16"
    >
      <Container className="flex flex-col gap-8">
        {socials.length > 0 ? (
          <SocialRow socials={socials} label="Profiles elsewhere, in the footer" />
        ) : null}

        {/* Sharing the site belongs at the end, where someone who has read
            it decides what to do next — not at the top, where nobody has seen
            anything to share yet. */}
        <ShareButton title={siteName} label="Share this site" className="self-start" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className={`max-w-2xl ${type.fine}`}>{note}</p>
            {/*
              The owner's local time. It lived in the header until nine section
              links made the row need 1149px inside a container capped at
              1072 — so it wrapped onto a second line at every width, and no
              breakpoint could fix it because the container never grows.

              Down here it has the room to show the full format at every size,
              and it is arguably where it belonged: someone reading the footer
              is deciding whether to get in touch, which is the only question
              this number answers.
            */}
            <IstClock serverNowIso={new Date().toISOString()} />
          </div>

          <p className="text-sm font-semibold tracking-tight text-fg">
            {siteName}
          </p>
        </div>
      </Container>
    </footer>
  );
}
