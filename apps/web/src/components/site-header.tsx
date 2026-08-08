import Link from "next/link";

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
 * Still no JavaScript-driven mobile menu: on narrow viewports the nav scrolls
 * horizontally within its own container, which stays fully keyboard operable
 * and adds nothing to the client bundle. The dedicated mobile phase can
 * replace this with a disclosure pattern if the link count grows — doing it
 * now would be scope creep.
 */
export function SiteHeader({ siteName, navigation }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-bg/85 backdrop-blur-md">
      <Container className="flex flex-col gap-2 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:py-0">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-fg transition-colors duration-150 hover:text-accent"
        >
          {siteName}
        </Link>
        <nav aria-label="Sections">
          <ul className="-mx-2 flex gap-0.5 overflow-x-auto sm:mx-0 sm:flex-wrap sm:gap-1">
            {navigation.map((item) => (
              <li key={item.targetId}>
                <a
                  href={`/#${item.targetId}`}
                  className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150 ${actionVariant.quiet}`}
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
