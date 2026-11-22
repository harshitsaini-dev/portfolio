/**
 * Every authenticated `/api/v1` endpoint.
 *
 * One catch-all rather than a file per resource, so there is exactly one
 * place a request can enter and exactly one pipeline it goes through —
 * authenticate, authorize, validate, then the repository layer (see
 * `lib/api/router.ts`). A route that forgot to authenticate cannot exist,
 * because no route authenticates itself.
 *
 * This is not under `(protected)`: the API is not for a signed-in browser.
 * Its credential is an API key, never the admin session cookie — so a page
 * on another site cannot make a logged-in owner's browser call it.
 */

import { authenticateApiKey } from "@/lib/api/keys";
import { API_ROUTES } from "@/lib/api/resources";
import { handleApiRequest, type Dependencies } from "@/lib/api/router";
import { getAdminRepositories } from "@/lib/db/binding";

export const dynamic = "force-dynamic";

const dependencies: Dependencies = {
  routes: API_ROUTES,
  getRepositories: getAdminRepositories,
  async authenticate(request, repos) {
    const outcome = await authenticateApiKey(request, repos.apiKeys);
    return outcome.ok ? outcome.key : null;
  },
  recordUse: (repos, key) => repos.apiKeys.touch(key.id),
};

async function handle(
  request: Request,
  context: RouteContext<"/api/v1/[...path]">,
): Promise<Response> {
  const { path } = await context.params;
  return handleApiRequest(request, path, dependencies);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
