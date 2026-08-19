/**
 * The protected admin boundary.
 *
 * Every page in this route group sits behind this layout, so a new admin
 * page is protected because of *where it lives* rather than because someone
 * remembered to add a guard. This is the authoritative authorization layer:
 * it independently resolves and verifies an admin identity on the server,
 * and does not trust any earlier network hop to have done so.
 */

import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { deniedRedirectPath, resolveAdminIdentity } from "@/lib/auth/guard";

/**
 * Force per-request rendering.
 *
 * **This is load-bearing security, not a performance hint.** Without it
 * Next prerenders this layout at build time and serves everyone the same
 * cached HTML — meaning the authorization check runs once, during the
 * build, and never again per request. The build output made this visible:
 * the route was marked `○ (Static)` and the denial page was being baked in.
 *
 * Next cannot infer the dependency on its own here, because the request
 * header is read through a dynamically imported, injectable reader rather
 * than a statically analysable `headers()` call. Stating it explicitly is
 * both correct and more robust than relying on inference.
 */
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const outcome = await resolveAdminIdentity();

  if (!outcome.ok) {
    // Server-side only. Never rendered, never sent to the browser.
    console.warn(`[admin] access denied (${outcome.reason}): ${outcome.detail}`);

    /**
     * Redirect rather than render a denial in place of `children`.
     *
     * A layout that simply returns different markup does **not** stop
     * `children` from rendering — React builds that tree concurrently — so
     * the page's output still ends up in the response. Redirecting at least
     * aborts navigation.
     *
     * This layout is the *boundary*, not the only guard: each protected page
     * additionally calls `requireAdminIdentityOrRedirect()` before producing
     * JSX, which is what actually prevents its content being serialized.
     * Keeping the check here too means a page that forgets is still denied.
     *
     * `unauthorized()` would express the 401 more precisely, but it remains
     * experimental behind `authInterrupts`, and a security boundary is the
     * wrong place to depend on an experimental flag.
     */
    // Our login when nobody is signed in; Access's page when Access
    // refused. See `deniedRedirectPath`.
    redirect(deniedRedirectPath(outcome.reason));
  }

  return <AdminShell identity={outcome.identity}>{children}</AdminShell>;
}
