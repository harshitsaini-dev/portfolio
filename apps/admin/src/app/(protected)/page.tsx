import type { Metadata } from "next";

import { withAdminPage } from "@/lib/auth/protected-page";
import { ADMIN_NAV } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Dashboard · Portfolio Admin",
};

/**
 * Admin dashboard.
 *
 * Deliberately operational: it describes the state of the *system*, not the
 * portfolio's content. There is no CMS content here — no projects, no
 * profile, no skills — because none of that is editable yet and inventing
 * placeholder content in the admin UI would be exactly the hardcoding the
 * project rules forbid.
 *
 * A Server Component with no data fetching. Wiring repositories to D1 is
 * Phase 7 work; doing it here purely to prove connectivity would add an
 * unused binding and a failure mode for no benefit.
 */
export default withAdminPage(() => {
  // Nothing in this callback runs until authorization has succeeded — the
  // wrapper awaits the guard before invoking it. See
  // `@/lib/auth/protected-page` for why the ordering matters.
  const pending = ADMIN_NAV.flatMap((group) =>
    group.items.filter((item) => !item.href),
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Overview
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Dashboard
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">
        The admin foundation is in place: authentication, the protected
        route boundary, and this shell. Content management screens arrive in
        the phases listed below.
      </p>

      <section aria-labelledby="status-heading" className="mt-12">
        <h2
          id="status-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          System status
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            {
              term: "Authentication",
              detail: "Cloudflare Access, with application-side JWT verification.",
            },
            {
              term: "Database schema",
              detail: "Defined and migrated locally; not yet applied remotely.",
            },
            {
              term: "Data layer",
              detail: "Typed repositories available; no CMS screens wired yet.",
            },
            {
              term: "Media storage",
              detail: "Not configured. Uploads arrive with R2 in a later phase.",
            },
          ].map((row) => (
            <div
              key={row.term}
              className="rounded-lg border border-subtle bg-surface p-5 shadow-sm"
            >
              <dt className="text-sm font-semibold text-fg">{row.term}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="pending-heading" className="mt-12">
        <h2
          id="pending-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Not yet available
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          These sections appear in the navigation but are not implemented.
          They are listed here so the gap is explicit rather than looking
          like a broken screen.
        </p>
        <ul className="mt-4 divide-y divide-subtle border-y border-subtle">
          {pending.map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between gap-4 py-3"
            >
              <span className="text-sm text-fg">{item.label}</span>
              <span className="text-xs font-medium text-fg-muted">
                {item.availableIn}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
});
