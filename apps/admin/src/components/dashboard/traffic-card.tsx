/**
 * Traffic, on the dashboard where the content is.
 *
 * The owner asked for the site's numbers here rather than on Cloudflare's
 * dashboard, which is why the data is collected first-party — see migration
 * 0011 and `apps/web/src/app/api/track/route.ts`.
 *
 * ## The bar chart is CSS, not a library
 *
 * A charting dependency for thirty numbers would be the largest thing in this
 * app. These are `<div>`s with a percentage height, which also makes them
 * trivially themeable and printable.
 *
 * It is `aria-hidden` and paired with a real table-free summary in text,
 * because a row of unlabelled bars conveys nothing to a screen reader — the
 * numbers that matter are stated in the heading and the lists.
 *
 * ## Zeroes are drawn
 *
 * The repository fills gaps with explicit zeroes rather than omitting days, so
 * a quiet week reads as a quiet week instead of a continuous line. A bar of
 * height zero still gets a hairline, so the day is visibly present and empty
 * rather than missing.
 */

import Link from "next/link";

import type { AnalyticsSummary } from "@portfolio/database";

/** `2026-08-09` → `9 Aug`, for the sparse axis labels. */
function toShortDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function RankedList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: readonly { label: string; views: number }[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate text-fg" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 font-mono text-xs text-fg-muted">
                {item.views.toLocaleString("en-GB")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrafficCard({
  summary,
  days,
}: {
  summary: AnalyticsSummary | null;
  days: number;
}) {
  // Null means the read failed — most likely migration 0011 has not been
  // applied yet. Said plainly rather than shown as "0 views", which would be a
  // number the dashboard does not actually have.
  if (!summary) {
    return (
      <section className="rounded-lg border border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-fg">Traffic</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Visitor counts aren’t available yet. If the site was deployed
          recently, the analytics tables may still need migrating.
        </p>
      </section>
    );
  }

  const peak = Math.max(...summary.daily.map((entry) => entry.views), 1);
  const first = summary.daily[0];
  const last = summary.daily[summary.daily.length - 1];

  return (
    <section className="rounded-lg border border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Traffic</h2>
        <p className="text-sm text-fg-muted">
          <span className="font-mono text-base text-fg">
            {summary.totalViews.toLocaleString("en-GB")}
          </span>{" "}
          {summary.totalViews === 1 ? "view" : "views"} in {days} days
        </p>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 flex h-20 items-end gap-px"
        role="presentation"
      >
        {summary.daily.map((entry) => (
          <div
            key={entry.day}
            title={`${toShortDay(entry.day)}: ${entry.views}`}
            className="flex-1 rounded-t-sm bg-accent/70"
            // Minimum 2px so an empty day is visible as an empty day. A bar
            // that disappears entirely reads as missing data.
            style={{
              height: `${Math.max((entry.views / peak) * 100, 2)}%`,
            }}
          />
        ))}
      </div>

      {first && last ? (
        <p aria-hidden="true" className="mt-1 flex justify-between text-xs text-fg-muted">
          <span>{toShortDay(first.day)}</span>
          <span>{toShortDay(last.day)}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-6">
        <RankedList
          title="Top pages"
          emptyLabel="No page views recorded yet."
          items={summary.topPaths}
        />
        <RankedList
          title="Top referrers"
          emptyLabel="No referrals yet — visits are direct."
          items={summary.topReferrers}
        />
      </div>

      <p className="mt-4 text-xs text-fg-muted">
        Counted without cookies or identifiers. Visits are aggregated per day,
        so individual visitors are not distinguishable.{" "}
        <Link
          href="/inbox"
          className="underline underline-offset-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Messages
        </Link>{" "}
        are the only place someone identifies themselves.
      </p>
    </section>
  );
}
