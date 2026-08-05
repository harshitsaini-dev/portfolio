import type { ReactNode } from "react";

/**
 * The page's horizontal rhythm, defined once: max width plus responsive
 * gutters. Every full-width band (header, hero, sections, footer) wraps its
 * contents in this so nothing drifts out of alignment.
 */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10 ${className}`}
    >
      {children}
    </div>
  );
}
