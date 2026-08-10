/**
 * `/whoami` — the easter-egg route.
 *
 * Hidden in the sense that nothing links to it from the ordinary page: it is
 * found by typing it, by running `whoami` in the terminal, or by reading the
 * console message. That is the whole joke, and it is aimed at exactly the
 * people who would try.
 *
 * ## Hidden is not secret
 *
 * Nothing here is private. It is the same public profile the home page shows,
 * formatted as shell output, so finding it early is a small delight and never
 * an information leak. Anything genuinely private would be in the admin app
 * behind Cloudflare Access, not behind an unguessed URL.
 *
 * It is excluded from the sitemap and marked `noindex` — not to conceal it,
 * but because a search result for it would spoil it and would rank against the
 * page that should win the same query.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { getSiteContent } from "@/lib/content/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return {
    title: `whoami · ${content.siteName}`,
    description: `${content.profile.name} — ${content.profile.role}.`,
    robots: { index: false, follow: true },
  };
}

/** One `key: value` line of the fake shell output. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <span className="w-28 shrink-0 text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

export default async function WhoamiPage() {
  const content = await getSiteContent();
  const { profile, socials, skillCategories, projects } = content;

  return (
    <main
      id="main-content"
      className="mx-auto min-h-dvh max-w-3xl px-6 py-16 font-mono text-sm"
    >
      <p className="text-fg-muted">
        <span className="select-none text-accent">
          visitor@portfolio:~${" "}
        </span>
        whoami
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <Field label="name" value={profile.name} />
        <Field label="role" value={profile.role} />
        {profile.location ? (
          <Field label="location" value={profile.location} />
        ) : null}
        <Field
          label="projects"
          value={`${projects.length} published`}
        />
        <Field
          label="skills"
          value={skillCategories
            .flatMap((category) => category.skills.map((skill) => skill.name))
            .slice(0, 8)
            .join(", ")}
        />
      </div>

      {profile.tagline ? (
        <p className="mt-8 max-w-xl leading-relaxed text-fg-muted">
          {profile.tagline}
        </p>
      ) : null}

      {socials.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-2">
          {socials.map((social) => (
            <li key={social.id} className="flex gap-4">
              <span className="w-28 shrink-0 text-fg-muted">
                {social.label}
              </span>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {social.url}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-12 text-fg-muted">
        <span className="select-none text-accent">
          visitor@portfolio:~${" "}
        </span>
        cd{" "}
        <Link
          href="/"
          className="text-accent underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          /
        </Link>
      </p>
      <p className="mt-2 text-fg-muted">
        Nicely found. There is a fuller one at{" "}
        <Link
          href="/terminal"
          className="text-accent underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          /terminal
        </Link>
        .
      </p>
    </main>
  );
}
