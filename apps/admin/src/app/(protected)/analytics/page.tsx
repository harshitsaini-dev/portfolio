/**
 * Traffic, in full.
 *
 * The dashboard's card answers "is anything happening" at a glance. This page
 * answers the questions that follow — which work people actually open, where
 * they arrive from, whether last week was better than the one before — so it
 * shows a longer window and every row rather than a top five.
 *
 * ## Ranges are links, not a client-side control
 *
 * `?days=7` is a URL, so a range can be bookmarked, opened in a second tab and
 * compared, and works before any JavaScript loads. A state toggle would be
 * fewer characters and none of that.
 *
 * ## The daily numbers are a table
 *
 * The bar chart is decoration and marked as such. Underneath it the same
 * numbers are a real table with header cells — which is the only version a
 * screen reader can read, and the version anyone gets when they want to know
 * what a bar actually was rather than roughly how tall it is.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = { title: "Analytics · Portfolio Admin" };

/** The offered windows. 90 is the practical ceiling for a per-day table. */
const RANGES = [7, 30, 90] as const;
const DEFAULT_RANGE = 30;

/** How many rows the ranked lists show. Generous — this is the detail page. */
const ROW_LIMIT = 25;

function toShortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function RankedTable({
  caption,
  columnLabel,
  emptyLabel,
  items,
  total,
}: {
  caption: string;
  columnLabel: string;
  emptyLabel: string;
  items: readonly { label: string; views: number }[];
  total: number;
}) {
  return (
    <section className="min-w-0 flex-1 rounded-lg border border-subtle bg-surface p-5">
      <h2 className="text-sm font-semibold text-fg">{caption}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">{emptyLabel}</p>
      ) : (
        <table className="mt-4 w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
              <th scope="col" className="w-2/3 pb-2 font-medium">
                {columnLabel}
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Views
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.label} className="border-b border-subtle/50 last:border-0">
                <td className="truncate py-2 text-fg" title={item.label}>
                  {item.label}
                </td>
                <td className="py-2 text-right font-mono text-xs text-fg-muted">
                  {item.views.toLocaleString("en-GB")}
                </td>
                <td className="py-2 text-right font-mono text-xs text-fg-muted">
                  {/* Guarded: a window with no views would divide by zero, and
                      "NaN%" is a worse answer than "0%". */}
                  {total > 0 ? `${Math.round((item.views / total) * 100)}%` : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Declared rather than taken from `PageProps<"/analytics">`.
 *
 * Next generates its route-literal union during a build, so a route that does
 * not exist yet cannot be named by one — and a type that only resolves after
 * the thing it describes has been built is a poor dependency for the file that
 * creates it. This is the shape Next actually passes.
 */
interface AnalyticsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default withAdminPage<AnalyticsPageProps>(async ({ props }) => {
  const params = await props.searchParams;
  const raw = params.days;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  // Validated against the offered set rather than clamped: `?days=100000`
  // would otherwise build a hundred-thousand-row table from one URL.
  const days = RANGES.find((range) => range === requested) ?? DEFAULT_RANGE;

  const repos = await getAdminRepositories();
  const summary = await repos.analytics
    .summary({ days, limit: ROW_LIMIT })
    .catch((error: unknown) => {
      console.error("analytics unavailable", error);
      return null;
    });

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm font-medium uppercase tracking-wider text-fg-muted">
        Analytics
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Traffic
      </h1>

      <nav aria-label="Time range" className="mt-6 flex flex-wrap gap-2">
        {RANGES.map((range) => {
          const isCurrent = range === days;
          return (
            <Link
              key={range}
              href={`/analytics?days=${range}`}
              // `aria-current` rather than colour alone: the selected range has
              // to be announced, not only seen.
              aria-current={isCurrent ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isCurrent
                  ? "border-accent bg-accent-soft font-medium text-fg"
                  : "border-subtle text-fg-muted hover:bg-surface"
              }`}
            >
              {range} days
            </Link>
          );
        })}
      </nav>

      {!summary ? (
        <p className="mt-8 rounded-lg border border-subtle bg-surface p-5 text-sm text-fg-muted">
          Visitor counts aren’t available. If the site was deployed recently,
          the analytics tables may still need migrating.
        </p>
      ) : (
        <>
          <section className="mt-8 rounded-lg border border-subtle bg-surface p-5">
            <p className="text-sm text-fg-muted">
              <span className="font-mono text-2xl text-fg">
                {summary.totalViews.toLocaleString("en-GB")}
              </span>{" "}
              {summary.totalViews === 1 ? "view" : "views"} over {days} days
            </p>

            <div aria-hidden="true" role="presentation" className="mt-5 flex h-28 items-end gap-px">
              {summary.daily.map((entry) => {
                const peak = Math.max(...summary.daily.map((d) => d.views), 1);
                return (
                  <div
                    key={entry.day}
                    title={`${toShortDay(entry.day)}: ${entry.views}`}
                    className="flex-1 rounded-t-sm bg-accent/70"
                    style={{ height: `${Math.max((entry.views / peak) * 100, 2)}%` }}
                  />
                );
              })}
            </div>

            <details className="mt-5">
              <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">
                Day by day
              </summary>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="pb-2 font-medium">
                      Day
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Newest first here, unlike the chart: a table is read from
                      the top, and the most recent day is the one being looked
                      for. */}
                  {[...summary.daily].reverse().map((entry) => (
                    <tr key={entry.day} className="border-b border-subtle/50 last:border-0">
                      <td className="py-1.5 text-fg">{toShortDay(entry.day)}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-fg-muted">
                        {entry.views.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <div className="mt-8 flex flex-col gap-8 lg:flex-row">
            <RankedTable
              caption="Pages"
              columnLabel="Path"
              emptyLabel="No page views recorded yet."
              items={summary.topPaths}
              total={summary.totalViews}
            />
            <RankedTable
              caption="Referrers"
              columnLabel="Source"
              emptyLabel="No referrals yet — every visit was direct."
              items={summary.topReferrers}
              total={summary.totalViews}
            />
          </div>

          <p className="mt-8 text-xs text-fg-muted">
            Counted without cookies, IP addresses or identifiers, and aggregated
            per day — so two visits by one person cannot be told apart from one
            visit by two. Referrers are stored as a host only, never a full URL.
          </p>
        </>
      )}
    </div>
  );
});
