/**
 * Page-view counts, aggregated per day.
 *
 * Unlike every other repository here, this one is written to by the **public
 * site** and read by the **admin**. That asymmetry shapes it:
 *
 * - The write path is one statement, takes no locks a visitor waits on, and
 *   returns nothing. A page render must never be slower because a counter is
 *   being kept.
 * - The read path is only ever a dashboard, so it is allowed to do the work —
 *   grouping and ordering happen in SQL rather than by loading rows into
 *   JavaScript.
 *
 * There is no `delete` and no `getById`, because there is no row that means
 * anything on its own. See migration 0011 for why the data is shaped this way.
 */

import type { D1Like } from "../d1.ts";
import { toDatabaseError } from "../errors.ts";
import { requireNumber, requireString } from "../mapping.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const ENTITY = "analytics";

/** A day's total, for the trend line. */
export interface DailyCount {
  readonly day: string;
  readonly views: number;
}

/** A path or a host, with its total over the window. */
export interface RankedCount {
  readonly label: string;
  readonly views: number;
}

export interface AnalyticsSummary {
  readonly totalViews: number;
  /** Ascending by day, and **gap-free** — see `summary`. */
  readonly daily: readonly DailyCount[];
  readonly topPaths: readonly RankedCount[];
  readonly topReferrers: readonly RankedCount[];
}

export interface AnalyticsRepository {
  /**
   * Count one view.
   *
   * `referrerHost` is null for a direct visit or an unparseable referrer —
   * both are "no known source" and neither deserves a row.
   */
  recordView(input: {
    path: string;
    referrerHost: string | null;
  }): Promise<void>;

  /** Totals over the last `days` days, inclusive of today. */
  summary(options?: { days?: number; limit?: number }): Promise<AnalyticsSummary>;
}

/** `YYYY-MM-DD` in UTC, the bucket label used by both tables. */
function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createAnalyticsRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): AnalyticsRepository {
  const repository: AnalyticsRepository = {
    async recordView({ path, referrerHost }) {
      const day = toDay(new Date(runtime.now()));

      try {
        // `ON CONFLICT ... DO UPDATE` rather than a read-then-write: two
        // visitors landing in the same millisecond would otherwise both read
        // the same count and both write it back, losing one. The upsert is a
        // single atomic statement, so the increment cannot be lost.
        const statements = [
          db
            .prepare(
              `INSERT INTO page_view_daily (day, path, views) VALUES (?, ?, 1)
               ON CONFLICT (day, path) DO UPDATE SET views = views + 1`,
            )
            .bind(day, path),
        ];

        if (referrerHost) {
          statements.push(
            db
              .prepare(
                `INSERT INTO referrer_daily (day, host, views) VALUES (?, ?, 1)
                 ON CONFLICT (day, host) DO UPDATE SET views = views + 1`,
              )
              .bind(day, referrerHost),
          );
        }

        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "create", cause);
      }
    },

    async summary(options) {
      const days = options?.days ?? 30;
      const limit = options?.limit ?? 5;

      // The window's first day, computed once and passed to every query so
      // they cannot disagree about where it starts.
      const since = new Date(runtime.now());
      since.setUTCDate(since.getUTCDate() - (days - 1));
      const sinceDay = toDay(since);

      try {
        const [dailyRows, pathRows, referrerRows] = await Promise.all([
          db
            .prepare(
              `SELECT day, SUM(views) AS views FROM page_view_daily
               WHERE day >= ? GROUP BY day ORDER BY day ASC`,
            )
            .bind(sinceDay)
            .all<{ day: string; views: number }>(),
          db
            .prepare(
              `SELECT path AS label, SUM(views) AS views FROM page_view_daily
               WHERE day >= ? GROUP BY path ORDER BY views DESC, label ASC LIMIT ?`,
            )
            .bind(sinceDay, limit)
            .all<{ label: string; views: number }>(),
          db
            .prepare(
              `SELECT host AS label, SUM(views) AS views FROM referrer_daily
               WHERE day >= ? GROUP BY host ORDER BY views DESC, label ASC LIMIT ?`,
            )
            .bind(sinceDay, limit)
            .all<{ label: string; views: number }>(),
        ]);

        const counted = new Map<string, number>();
        for (const row of dailyRows.results ?? []) {
          counted.set(
            requireString(ENTITY, row, "day"),
            requireNumber(ENTITY, row, "views"),
          );
        }

        // Days with no visits have no row, and a chart drawn straight from the
        // rows would silently close the gap — making a quiet week look like a
        // continuous line. Filled with explicit zeroes so the shape is honest.
        const daily: DailyCount[] = [];
        for (let offset = 0; offset < days; offset += 1) {
          const cursor = new Date(runtime.now());
          cursor.setUTCDate(cursor.getUTCDate() - (days - 1 - offset));
          const day = toDay(cursor);
          daily.push({ day, views: counted.get(day) ?? 0 });
        }

        const toRanked = (
          rows: { results?: Record<string, unknown>[] } | undefined,
        ): RankedCount[] =>
          (rows?.results ?? []).map((row) => ({
            label: requireString(ENTITY, row, "label"),
            views: requireNumber(ENTITY, row, "views"),
          }));

        return {
          totalViews: daily.reduce((sum, entry) => sum + entry.views, 0),
          daily,
          topPaths: toRanked(pathRows),
          topReferrers: toRanked(referrerRows),
        };
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },
  };

  return repository;
}
