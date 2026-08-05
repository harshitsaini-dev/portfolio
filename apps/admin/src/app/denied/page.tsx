import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access denied · Portfolio Admin",
};

/**
 * The unauthenticated landing page.
 *
 * Lives **outside** the `(protected)` route group on purpose: the protected
 * layout redirects here, and this page must render without an identity.
 *
 * The message is deliberately generic. It says access was denied, not
 * *why* — "expired token", "wrong audience", or "development auth is not
 * enabled" would each tell an attacker precisely which part of their
 * attempt to change. The real reason is in the server logs.
 */
export default function DeniedPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-fg">
        Access denied
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">
        You are not signed in to an account with access to this
        administration area.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        Access is managed through Cloudflare Access. If you believe this is a
        mistake, contact the site owner.
      </p>
    </main>
  );
}
