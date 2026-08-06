/**
 * The admin shell: skip link, header, sidebar, main region.
 *
 * A Server Component. It receives an already-resolved identity as a plain
 * prop — the shell never performs authentication itself, and never sees a
 * token. Only the two navigation pieces are client-side, and only because
 * they need the current pathname and a dialog.
 */

import type { ReactNode } from "react";

import { AdminNav } from "./admin-nav";
import { MobileNav } from "./mobile-nav";
import { identityLabel, type AdminIdentity } from "@/lib/auth/identity";

export function AdminShell({
  identity,
  children,
}: {
  identity: AdminIdentity;
  children: ReactNode;
}) {
  const isDevelopment = identity.source === "development";

  return (
    <>
      {/* First focusable element on the page, visible only when focused. */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-subtle bg-bg/95 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <MobileNav />
              <span className="text-sm font-semibold tracking-tight">
                Portfolio Admin
              </span>
            </div>

            <div className="flex items-center gap-3">
              {isDevelopment ? (
                /* Deliberately conspicuous. If this badge ever appears on a
                   real deployment, something is very wrong — so it should
                   be impossible to miss rather than a subtle grey hint. */
                <span className="rounded-full border border-strong bg-surface-muted px-2.5 py-1 text-xs font-semibold text-fg">
                  Development auth
                </span>
              ) : null}
              <span className="hidden text-sm text-fg-muted sm:inline">
                {identityLabel(identity)}
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          {/* Desktop sidebar. Hidden below `lg`, where MobileNav takes over;
              the same AdminNav renders in both, so they cannot drift. */}
          <aside className="hidden w-64 shrink-0 border-r border-subtle p-5 lg:block">
            <AdminNav />
          </aside>

          {/*
            `min-w-0` is load-bearing: a flex item's automatic minimum size
            is its content, so without it a wide child — the CMS list tables,
            which carry a `min-w-*` so their columns stay legible — stretches
            `main` past the viewport and scrolls the whole page sideways
            instead of scrolling inside its own `overflow-x-auto` wrapper.
          */}
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
