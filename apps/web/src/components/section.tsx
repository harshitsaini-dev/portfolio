import type { ReactNode } from "react";

interface SectionProps {
  /** Anchor target — must match the navigation item pointing at this section. */
  id: string;
  title: string;
  /** Optional short lead paragraph rendered under the section heading. */
  lead?: string;
  children: ReactNode;
}

/**
 * A titled page section with a consistent container, heading level, and
 * spacing. Every section renders an <h2>, which keeps the page's heading
 * hierarchy flat and predictable beneath the single <h1> in the hero.
 */
export function Section({ id, title, lead, children }: SectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="border-t border-border py-16 sm:py-20"
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2
          id={headingId}
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {title}
        </h2>
        {lead ? (
          <p className="mt-3 max-w-2xl text-base text-muted">{lead}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
