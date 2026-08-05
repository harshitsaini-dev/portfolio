import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not found · Portfolio Admin",
};

/**
 * Admin 404.
 *
 * Rendered outside the protected layout, so it deliberately reveals nothing
 * about which admin routes exist — it offers a single link back to the
 * dashboard rather than a menu of destinations.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-fg">
        Page not found
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">
        This admin page does not exist. It may not have been built yet.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
