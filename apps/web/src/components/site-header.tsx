import Link from "next/link";

import { SiteNavMenu } from "@/components/site-nav-menu";
import { Container } from "@/components/ui/container";
import { actionVariant } from "@/components/ui/action";
import type { NavigationItem } from "@/data/types";

interface SiteHeaderProps {
  siteName: string;
  navigation: readonly NavigationItem[];
}

/**
 * Sticky site header with anchor navigation.
 *
 * The site is no longer one page: project case studies live at
 * `/projects/[slug]`. So the name is a link home, and the section links are
 * **root-relative** (`/#projects`, not `#projects`). A bare fragment on a
 * project page would look for a section that is not there and do nothing —
 * the kind of dead link that only appears on the second page you build.
 *
 * Below `md` the links move into a menu button. The row used to scroll
 * horizontally instead: that was keyboard operable, but it put a scrollbar
 * inside the header and hid links past the edge with nothing announcing they
 * were there. See `SiteNavMenu` for why the drawer is a native `<dialog>`.
 */
export function SiteHeader({ siteName, navigation }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-bg/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-fg transition-colors duration-150 hover:text-accent"
        >
          {siteName}
        </Link>
        <SiteNavMenu navigation={navigation} />

        {/* The inline row appears only where every link fits, so it never
            needs to scroll. */}
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex flex-wrap gap-1">
            {navigation.map((item) => (
              <li key={item.targetId}>
                <a
                  href={`/#${item.targetId}`}
                  className={`link-underline inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150 ${actionVariant.quiet}`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  );
}
