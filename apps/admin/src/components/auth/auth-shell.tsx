import Link from "next/link";

import { ThemeToggle } from "@portfolio/ui/components/theme-toggle";

/**
 * The frame every signed-out page sits in.
 *
 * One card, centred, with the theme control in the corner. The control is
 * here rather than only inside the CMS because a login page is the first thing
 * an editor sees and often the longest they look at while typing carefully —
 * being unable to turn down a white screen until *after* signing in is the
 * kind of small rudeness that is easy to fix and easy to forget.
 *
 * No navigation, no branding beyond the title, and nothing that says whether
 * an account exists. Everything on a signed-out page is visible to anybody who
 * can reach the URL.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center sm:pb-24">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm text-fg-muted">{description}</p>
          ) : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}

/** A quiet link back to the start, used by every page that is not it. */
export function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="text-accent underline underline-offset-4 transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Back to sign in
    </Link>
  );
}
