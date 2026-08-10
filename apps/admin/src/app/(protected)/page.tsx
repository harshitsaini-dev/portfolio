import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = {
  title: "Dashboard · Portfolio Admin",
};

/**
 * Admin dashboard.
 *
 * Rewritten when the site went live. It used to describe the *system* —
 * "authentication is in place", "content screens arrive in later phases",
 * "schema not yet applied remotely" — which was true when nothing was
 * deployed and became actively misleading the moment everything was. A
 * dashboard that reports a finished build as unfinished is worse than no
 * dashboard.
 *
 * What replaces it answers the two questions an editor actually opens this
 * page with: **is anything waiting for me**, and **what is on the site right
 * now**. Both come from the database, so nothing here can drift out of date
 * the way the previous copy did.
 *
 * Counts, not previews. A dashboard that lists recent projects becomes a
 * second, worse projects screen that has to be kept in step with the real
 * one; a count links to the screen that owns the subject.
 */
export default withAdminPage(async () => {
  // Nothing in this callback runs until authorization has succeeded — the
  // wrapper awaits the guard before invoking it.
  const repos = await getAdminRepositories();

  // One round of parallel reads. Counting in the application rather than with
  // `COUNT(*)` queries is deliberate at this size: the repository layer is the
  // only way in by project rule, these lists are tens of rows, and adding a
  // count method to every repository to save a few hundred bytes would be
  // machinery bought for a page loaded a few times a day.
  const [
    messages,
    projects,
    technologies,
    timeline,
    education,
    certifications,
    tools,
    socials,
    media,
    sections,
    robotLines,
  ] = await Promise.all([
    repos.contactMessages.list(),
    repos.projects.list(),
    repos.technologies.list(),
    repos.timeline.list(),
    repos.education.list(),
    repos.certifications.list(),
    repos.tools.list(),
    repos.socialLinks.list(),
    repos.media.list(),
    repos.sections.list(),
    repos.robotLines.list(),
  ]);

  const unread = messages.filter((message) => message.status === "unread");
  const hiddenSections = sections.filter((section) => !section.isVisible);

  const counts = [
    { label: "Projects", value: projects.length, href: "/projects" },
    { label: "Technologies", value: technologies.length, href: "/technologies" },
    { label: "Experience", value: timeline.length, href: "/timeline" },
    { label: "Education", value: education.length, href: "/education" },
    {
      label: "Certifications",
      value: certifications.length,
      href: "/certifications",
    },
    { label: "Tools", value: tools.length, href: "/tools" },
    { label: "Social links", value: socials.length, href: "/socials" },
    { label: "Media", value: media.length, href: "/media" },
    { label: "Robot lines", value: robotLines.length, href: "/robot-lines" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Overview
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Dashboard
      </h1>

      {/*
        The inbox first, and only when it has something to say.

        An always-present "0 unread" tile trains an editor to ignore the top of
        the page, which is the one place a genuine notice has to be seen.
      */}
      {unread.length > 0 ? (
        <Link
          href="/inbox"
          className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-accent/40 bg-accent-soft p-4 transition-colors duration-150 hover:bg-surface-muted"
        >
          <span className="text-sm font-medium text-fg">
            {unread.length === 1
              ? "1 unread message"
              : `${unread.length} unread messages`}
          </span>
          <span aria-hidden="true" className="text-sm text-fg-muted">
            Open inbox →
          </span>
        </Link>
      ) : (
        <p className="mt-6 text-base leading-relaxed text-fg-muted">
          No unread messages. Everything below is live on the site.
        </p>
      )}

      {/*
        The five most recent messages, in full enough to triage without
        leaving the page — who wrote, when, and the first line. Not the whole
        body: reading it belongs in the inbox, where marking it read happens.
      */}
      {messages.length > 0 ? (
        <section aria-labelledby="inbox-heading" className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="inbox-heading"
              className="text-sm font-semibold uppercase tracking-wider text-fg"
            >
              Recent messages
            </h2>
            <Link href="/inbox" className="text-sm text-fg-muted underline underline-offset-4">
              All {messages.length}
            </Link>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {messages.slice(0, 5).map((message) => (
              <li key={message.id}>
                <Link
                  href={`/inbox/${message.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-subtle bg-surface p-4 transition-colors duration-150 hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2">
                    {message.status === "unread" ? (
                      <>
                        {/* A dot, plus the word for anyone who cannot see it.
                            Colour alone is never the signal. */}
                        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                        <span className="sr-only">Unread.</span>
                      </>
                    ) : null}
                    <span className="text-sm font-medium text-fg">
                      {message.senderName}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {message.senderEmail}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm text-fg-muted">
                    {message.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="content-heading" className="mt-12">
        <h2
          id="content-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          Content
        </h2>
        {/*
          Each tile is a link, because a count with nowhere to go is trivia.
          The number is the heading of its own card so it reads as
          "Projects, 4" rather than as a bare digit.
        */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {counts.map((entry) => (
            <li key={entry.label}>
              <Link
                href={entry.href}
                className="flex min-h-24 flex-col justify-between rounded-lg border border-subtle bg-surface p-4 transition-colors duration-150 hover:bg-surface-muted"
              >
                <span className="text-2xl font-semibold tabular-nums text-fg">
                  {entry.value}
                </span>
                <span className="text-sm text-fg-muted">{entry.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="page-heading" className="mt-12">
        <h2
          id="page-heading"
          className="text-sm font-semibold uppercase tracking-wider text-fg"
        >
          The page itself
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-subtle bg-surface p-4">
            <dt className="text-sm font-medium text-fg">Sections</dt>
            <dd className="mt-1 text-sm text-fg-muted">
              {hiddenSections.length === 0
                ? "Every section is visible."
                : `${hiddenSections.length} hidden: ${hiddenSections
                    .map((section) => section.title)
                    .join(", ")}.`}{" "}
              <Link href="/sections" className="underline underline-offset-4">
                Manage sections
              </Link>
            </dd>
          </div>
          <div className="rounded-lg border border-subtle bg-surface p-4">
            <dt className="text-sm font-medium text-fg">Appearance</dt>
            <dd className="mt-1 text-sm text-fg-muted">
              Theme, accent colour, favicon and the 3D scene.{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Open settings
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
});
