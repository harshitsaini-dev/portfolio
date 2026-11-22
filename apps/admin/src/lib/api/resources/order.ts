/**
 * `PUT /<collection>/order` — set a whole collection's display order in one
 * call, for every collection that has a `position`.
 *
 * The rule, the same everywhere:
 *
 *   - the listed ids take positions 0, 1, 2… in the order given;
 *   - rows not listed keep their current relative order, after the listed
 *     ones — so "move these three to the top" is one short request;
 *   - an id that is not in the collection is a 422, and nothing is written.
 *
 * Only rows whose position actually changes are written, through each
 * repository's own `update` — the same path the admin's position field uses.
 *
 * The response is exactly what the collection's own `GET` list returns (its
 * handler is reused, without filters), so a client sees one shape for one
 * collection whichever way it asked.
 */

import type { Repositories } from "@portfolio/database";
import { reorderSchema } from "@portfolio/schemas";

import { ApiError, defineRoute, type ApiRoute, type PathParams } from "../define.ts";

interface Positioned {
  readonly id: string;
  readonly position: number;
}

export interface OrderTarget {
  /** The collection's GET list route; its handler and schema are reused. */
  readonly listRoute: ApiRoute;
  /** Plural, for prose: "projects". */
  readonly noun: string;
  readonly operationId: string;
  /** Every row, in current display order, unfiltered. */
  rows(repos: Repositories, params: PathParams): Promise<readonly Positioned[]>;
  setPosition(repos: Repositories, id: string, position: number): Promise<unknown>;
}

export function orderRoute(target: OrderTarget): ApiRoute {
  const { listRoute } = target;
  if (listRoute.method !== "GET") throw new Error(`${target.operationId}: listRoute must be a GET`);
  return defineRoute({
    method: "PUT",
    path: `${listRoute.path}/order`,
    tag: listRoute.tag,
    operationId: target.operationId,
    summary: `Reorder ${target.noun}`,
    description:
      `Body: \`{ "ids": [...] }\`, first to last. Listed ${target.noun} take positions 0, 1, 2… in that order; ` +
      `any not listed keep their relative order after them. An id that is not one of these ${target.noun} is a 422 and nothing changes. ` +
      `Returns the same shape as \`${listRoute.operationId}\`, in the new order.`,
    scope: "write",
    body: reorderSchema,
    returns: `Every one of the ${target.noun}, in the new order.`,
    ...(listRoute.response ? { response: listRoute.response } : {}),
    async handler(context, params, input) {
      const current = await target.rows(context.repos, params);
      const known = new Set(current.map((row) => row.id));
      const unknown = input.ids.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new ApiError(422, "validation_failed", "Some ids are not in this collection.", {
          ids: unknown.map((id) => `Unknown id: ${id}`),
        });
      }

      const listed = new Set(input.ids);
      const order = [...input.ids, ...current.filter((row) => !listed.has(row.id)).map((row) => row.id)];
      const before = new Map(current.map((row) => [row.id, row.position]));
      for (const [position, id] of order.entries()) {
        if (before.get(id) !== position) await target.setPosition(context.repos, id, position);
      }

      const unfiltered = { ...context, query: new URLSearchParams() };
      return (listRoute.handler as (c: typeof unfiltered, p: PathParams) => Promise<unknown>)(unfiltered, params);
    },
  });
}
