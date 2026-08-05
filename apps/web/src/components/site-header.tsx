import type { NavigationItem } from "@/data/types";

interface SiteHeaderProps {
  siteName: string;
  navigation: readonly NavigationItem[];
}

/**
 * Sticky site header with anchor navigation to the page's sections.
 *
 * Deliberately has no JavaScript-driven mobile menu: on narrow viewports the
 * nav simply wraps and scrolls horizontally within its own container, which
 * stays fully keyboard operable and adds no client bundle. A disclosure menu
 * can replace this later if the link count grows enough to need one.
 */
export function SiteHeader({ siteName, navigation }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        {/* Rendered as text, not a link: this is a single-page site, so a
            "home" link would only point at the page you are already on. */}
        <span className="text-base font-semibold tracking-tight">
          {siteName}
        </span>
        <nav aria-label="Sections">
          <ul className="-mx-1 flex gap-1 overflow-x-auto sm:mx-0 sm:flex-wrap sm:gap-2">
            {navigation.map((item) => (
              <li key={item.targetId}>
                <a
                  href={`#${item.targetId}`}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm text-muted hover:bg-surface hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
