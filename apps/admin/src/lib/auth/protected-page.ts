/**
 * The approved way to write a protected admin page.
 *
 * ## Why this exists
 *
 * Phase 6 browser verification uncovered a Next.js/RSC behaviour that makes
 * layout-only authorization unsafe as a *confidentiality* boundary:
 *
 *   React renders a layout and its `children` concurrently. When only the
 *   layout redirected an unauthenticated request, the page component had
 *   already executed, and its output was serialized into the RSC flight
 *   payload shipped with the redirect response. Measured against a
 *   production build: `GET /` returned 307 with an 11.9 KB body containing
 *   the dashboard's full component tree. A browser discards a redirect
 *   body, so it *looked* protected; `curl` saw everything.
 *
 * The fix is ordering: authorization must complete *before* the page's
 * render/data work begins. That cannot be expressed as a JSX boundary —
 * `<Protected>{children}</Protected>` has the identical flaw, because
 * `children` is an already-constructed element tree that React is free to
 * render independently of its parent's decision.
 *
 * So the guard wraps the page **function**, not its output. `render` is a
 * callback that this module simply does not invoke until
 * `requireAdminIdentityOrRedirect()` has resolved. If the request is
 * unauthenticated, the redirect is thrown while the component is still
 * executing: no JSX is produced, no data is fetched, and there is nothing
 * to serialize.
 *
 * ## Usage
 *
 *     export default withAdminPage(async ({ identity }) => {
 *       const projects = await repos.projects.list();   // runs only if authorized
 *       return <ProjectList projects={projects} signedInAs={identity.email} />;
 *     });
 *
 * `scripts/shell-tests.mjs` fails the build if any `page.tsx` under
 * `(protected)/` does not use this wrapper, so a new route cannot quietly
 * reintroduce the leak.
 *
 * This is defence in depth, not a replacement: `(protected)/layout.tsx`
 * keeps its own guard as the boundary that catches a page which somehow
 * bypasses the convention.
 */

import "server-only";

import type { ReactNode } from "react";

import { requireAdminIdentityOrRedirect } from "./guard.ts";
import type { AdminIdentity } from "./identity.ts";

/**
 * What a protected page's render callback receives.
 *
 * The verified identity is passed in directly, so a page never calls the
 * auth layer itself and never sees a token or a raw claim — only the
 * normalized three-field identity.
 */
export interface AdminPageContext<TProps> {
  readonly identity: AdminIdentity;
  /** The props Next.js passed to the page (`params`, `searchParams`). */
  readonly props: TProps;
}

export type AdminPageRender<TProps> = (
  context: AdminPageContext<TProps>,
) => ReactNode | Promise<ReactNode>;

/**
 * Wrap a protected page so authorization runs before anything else.
 *
 * The ordering guarantee is the entire point: `render` is a function this
 * module calls, and it is called on exactly one line — after the `await`.
 * There is no path that reaches `render` without a verified identity.
 */
export function withAdminPage<TProps = Record<string, unknown>>(
  render: AdminPageRender<TProps>,
) {
  return async function ProtectedAdminPage(props: TProps): Promise<ReactNode> {
    // Authorization first. On failure this throws a redirect and `render`
    // is never invoked, so the page produces no output to leak.
    const identity = await requireAdminIdentityOrRedirect();
    return render({ identity, props });
  };
}
