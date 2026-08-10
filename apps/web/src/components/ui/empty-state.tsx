/**
 * What a section says when it has nothing to show.
 *
 * ## Why this exists
 *
 * "No published projects yet" as a bare line of grey text reads like a bug —
 * the same visual weight as an error, with none of the explanation. An empty
 * section is usually the most honest thing on a page and it should look
 * deliberate.
 *
 * ## The illustration is decorative, and marked as such
 *
 * `aria-hidden`, no title, no accessible name. It carries no information the
 * heading and the sentence do not, and a screen reader announcing "image" here
 * would be pure interruption. It is inline SVG rather than a file so it inherits
 * `currentColor` and follows the theme without a second asset per palette.
 *
 * ## The pulse is not a spinner
 *
 * A spinner promises that something is loading and will finish. Nothing here is
 * loading; the section is empty because there is nothing in it. The dot pulses
 * slowly to suggest "waiting", and stops entirely under reduced motion —
 * hence the CSS class rather than an inline animation.
 */

import type { ReactNode } from "react";

import type { SocialProfile } from "@/data/types";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-subtle bg-surface/50 px-6 py-12 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 96 72"
        className="h-20 w-auto text-fg-muted/40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* An open, empty drawer: the shape of "nothing here yet" without a
            single word of language to translate. */}
        <rect x="12" y="20" width="72" height="44" rx="4" />
        <path d="M12 32h72" />
        <path d="M40 26h16" />
        <path d="M24 8l8 10M72 8l-8 10" className="opacity-60" />
        <circle cx="48" cy="48" r="3" className="empty-state-pulse" fill="currentColor" stroke="none" />
      </svg>

      <div className="flex flex-col gap-2">
        <p className="text-base font-medium text-fg">{title}</p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-fg-muted">
          {children}
        </p>
      </div>

      {action}
    </div>
  );
}

/**
 * "Meanwhile, see my GitHub →" — somewhere to go when a section is empty.
 *
 * ## The destination is content, never a constant
 *
 * The URL and the name both come from the CMS's social profiles, so this
 * cannot point at an account the owner has since replaced, and the wording
 * follows whatever they called it. A site with no social profiles renders no
 * button at all rather than a link to nowhere.
 *
 * A code host is preferred because an empty *projects* section is the case
 * this exists for and unpublished work usually still has commits behind it —
 * but the preference is soft, and any profile is better than a dead end.
 */
export function EmptyStateElsewhere({
  socials,
}: {
  socials: readonly SocialProfile[];
}) {
  if (socials.length === 0) return null;

  const CODE_HOSTS = ["github", "gitlab", "codeberg", "bitbucket"];
  const target =
    socials.find((social) =>
      CODE_HOSTS.some(
        (host) =>
          social.platform.toLowerCase().includes(host) ||
          social.url.toLowerCase().includes(`${host}.`),
      ),
    ) ?? socials[0];

  if (!target) return null;

  return (
    <a
      href={target.url}
      // An editor-supplied destination, so the same rules the rest of the site
      // applies to outbound links apply here.
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-subtle px-4 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Meanwhile, see my {target.label}
      {/* Decorative: the arrow repeats "this goes somewhere", which the link
          role already says. */}
      <span aria-hidden="true">→</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
