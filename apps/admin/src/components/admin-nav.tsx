"use client";

/**
 * Admin primary navigation.
 *
 * A Client Component for exactly one reason: it needs `usePathname()` to
 * mark the current section with `aria-current="page"`. That is genuine
 * interactivity-adjacent state, not styling — everything else in the shell
 * stays a Server Component.
 *
 * It receives no identity, no configuration, and no token. Its entire
 * client payload is the static navigation model.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";

import { ADMIN_NAV } from "@/lib/navigation";

const itemBase =
  "flex min-h-11 items-center rounded-md px-3 text-sm transition-colors duration-150";

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // This component renders twice — desktop sidebar and mobile drawer — so a
  // fixed id per group would produce duplicates. `useId` gives each instance
  // its own stable, SSR-safe prefix.
  const instanceId = useId();

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-6">
      {ADMIN_NAV.map((group) => {
        const labelId = `${instanceId}-${group.heading.toLowerCase().replace(/\W+/g, "-")}`;

        return (
        <div key={group.heading}>
          {/* Deliberately NOT a heading element. These label navigation
              groups, not document sections — and because the sidebar
              precedes <main> in DOM order, making them <h2> put six h2s
              ahead of the page's <h1> and produced a nonsense outline. The
              list is associated with its label via aria-labelledby, so the
              grouping is still announced without polluting the heading
              structure. */}
          <p
            id={labelId}
            className="px-3 text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted"
          >
            {group.heading}
          </p>
          <ul aria-labelledby={labelId} className="mt-2 flex flex-col gap-0.5">
            {group.items.map((item) => {
              if (!item.href) {
                // Unavailable sections are plain text, not links and not
                // disabled buttons: there is nothing to activate, so nothing
                // should be focusable. The reason is visible, not a tooltip,
                // so it is not hover-only information.
                return (
                  <li key={item.label}>
                    <span
                      className={`${itemBase} justify-between text-fg-muted/70`}
                    >
                      {item.label}
                      <span className="text-[0.6875rem] font-medium text-fg-muted/70">
                        {item.availableIn}
                      </span>
                    </span>
                  </li>
                );
              }

              // Exact match for the dashboard; prefix match elsewhere, so
              // `/projects/new` and `/projects/<id>` still mark Projects as
              // the current section rather than leaving nothing highlighted.
              const isCurrent =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={onNavigate}
                    className={`${itemBase} ${
                      isCurrent
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}
