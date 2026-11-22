/**
 * `/analytics` — the same summary the admin's Analytics page shows.
 *
 * Read-only: page views are recorded by the public site's beacon, never by a
 * client of this API. `days` is limited to the ranges the admin offers, for
 * the admin's reason — an arbitrary window would let one request build an
 * arbitrarily large gap-free daily table.
 */

import { badRequest, defineRoute, type ApiRoute, type JsonSchema } from "../define.ts";
import { entity, primitives } from "./schemas.ts";

const TAG = "Analytics";

const { str, int } = primitives;

/** The windows the admin's Analytics page offers. */
const RANGES = [7, 30, 90] as const;
const DEFAULT_RANGE = 30;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const analyticsSchemas: Record<string, JsonSchema> = {
  DailyCount: entity("Views on one UTC day.", {
    day: { ...str, description: "YYYY-MM-DD" },
    views: int,
  }),
  RankedCount: entity("Views for one path or referrer.", { label: str, views: int }),
  AnalyticsSummary: entity("Page views over a window of days.", {
    totalViews: int,
    daily: {
      type: "array",
      description: "Ascending by day and gap-free: days without views are present with 0.",
      items: { $ref: "#/components/schemas/DailyCount" },
    },
    topPaths: { type: "array", items: { $ref: "#/components/schemas/RankedCount" } },
    topReferrers: { type: "array", items: { $ref: "#/components/schemas/RankedCount" } },
  }),
};

export const analyticsRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/analytics",
    tag: TAG,
    operationId: "getAnalyticsSummary",
    summary: "Page-view summary",
    description: "Totals, a daily series and the top paths and referrers for the last `days` days (UTC, including today).",
    scope: "read",
    queryParams: [
      { name: "days", description: `Window size. Default ${DEFAULT_RANGE}.`, enum: RANGES.map(String) },
      { name: "limit", description: `Rows in each top list, 1–${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.` },
    ],
    returns: "The analytics summary.",
    response: { $ref: "#/components/schemas/AnalyticsSummary" },
    async handler({ repos, query }) {
      const rawDays = query.get("days");
      let days: number = DEFAULT_RANGE;
      if (rawDays !== null && rawDays !== "") {
        const requested = Number(rawDays);
        if (!(RANGES as readonly number[]).includes(requested)) {
          throw badRequest(`\`days\` must be one of ${RANGES.join(", ")}.`);
        }
        days = requested;
      }

      const rawLimit = query.get("limit");
      let limit = DEFAULT_LIMIT;
      if (rawLimit !== null && rawLimit !== "") {
        const requested = Number(rawLimit);
        if (!Number.isInteger(requested) || requested < 1 || requested > MAX_LIMIT) {
          throw badRequest(`\`limit\` must be an integer from 1 to ${MAX_LIMIT}.`);
        }
        limit = requested;
      }

      return repos.analytics.summary({ days, limit });
    },
  }),
];
