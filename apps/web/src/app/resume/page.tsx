/**
 * The résumé, as a page that prints.
 *
 * ## Built for two readers, one of which is software
 *
 * An applicant tracking system reads the DOM, not the design. So this is
 * ordinary semantic HTML in reading order: headings, lists, real dates as
 * `<time>`, and the contact details as text rather than icons. Nothing here is
 * an image of a word, nothing is in a column that reads out of order, and
 * every fact is content from the CMS — the same source as the site, so the
 * résumé cannot go stale while the portfolio is updated.
 *
 * ## Why not just link the PDF
 *
 * The PDF is still offered — it is what most people will hand on. But a PDF is
 * a file someone has to find, open and zoom; this is a URL that opens instantly
 * on a phone and prints identically from any browser. They serve different
 * moments, so the site has both.
 *
 * ## The print rules live in `globals.css`
 *
 * Under `@media print`: chrome hidden, colours flattened to ink, links given
 * their destination in brackets. Print styles in the stylesheet rather than
 * inline because they describe a medium, not a component.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { PrintButton } from "@/components/ui/print-button";
import { getSiteContent } from "@/lib/content/site-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return {
    title: `Résumé · ${content.profile.name}`,
    description: `${content.profile.role} — ${content.profile.tagline}`,
    // Kept out of search results deliberately: the portfolio is the page that
    // should rank, and a résumé indexed separately competes with it for the
    // same query while saying less.
    robots: { index: false, follow: true },
  };
}

/** A section with a rule under its heading. Repeated four times below. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="border-b border-strong pb-1 text-sm font-semibold uppercase tracking-[0.14em] text-fg">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default async function ResumePage() {
  const content = await getSiteContent();
  const { profile, timeline, education, certifications, skillCategories, socials, resume } =
    content;

  return (
    <main
      id="main-content"
      className="mx-auto max-w-3xl px-6 py-12 print:max-w-none print:px-0 print:py-0"
    >
      {/* Screen-only controls. `print:hidden` rather than a media query in
          JavaScript: the browser already knows which medium it is painting. */}
      <div className="mb-10 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href="/"
          className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
        >
          ← Back to the site
        </Link>
        <span aria-hidden="true" className="text-fg-muted">
          ·
        </span>
        <PrintButton />
        {resume ? (
          <>
            <span aria-hidden="true" className="text-fg-muted">
              ·
            </span>
            <a
              href={resume.href}
              className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg"
            >
              {resume.label}
            </a>
          </>
        ) : null}
      </div>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          {profile.name}
        </h1>
        <p className="mt-1 text-lg text-fg-muted">{profile.role}</p>
        {/* Contact details as a plain list of text. An ATS cannot read an icon,
            and a person reading on paper cannot click one. */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
          {profile.location ? <li>{profile.location}</li> : null}
          {socials.map((social) => (
            <li key={social.id}>
              <a href={social.url} className="underline underline-offset-2">
                {social.label}
              </a>
            </li>
          ))}
        </ul>
      </header>

      {profile.introduction.length > 0 ? (
        <Section title="Profile">
          {profile.introduction.map((paragraph, i) => (
            <p key={i} className="text-sm leading-relaxed text-fg-muted">
              {paragraph}
            </p>
          ))}
        </Section>
      ) : null}

      {timeline.length > 0 ? (
        <Section title="Experience">
          {timeline.map((entry) => (
            <article key={entry.id} className="break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-fg">{entry.role}</h3>
                <span className="font-mono text-xs text-fg-muted">{entry.period}</span>
              </div>
              <p className="text-sm font-medium text-accent">{entry.organization}</p>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{entry.summary}</p>
              {entry.highlights.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </Section>
      ) : null}

      {skillCategories.length > 0 ? (
        <Section title="Skills">
          {skillCategories.map((category) => (
            <div key={category.id} className="break-inside-avoid">
              <h3 className="text-sm font-semibold text-fg">{category.name}</h3>
              {/* Comma-separated text, not chips: a keyword scanner reads the
                  sentence, and chips print as a scattered grid. */}
              <p className="mt-1 text-sm text-fg-muted">
                {category.skills.map((skill) => skill.name).join(", ")}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      {education.length > 0 ? (
        <Section title="Education">
          {education.map((entry) => (
            <article key={entry.id} className="break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-fg">
                  {entry.qualification}
                </h3>
                <span className="font-mono text-xs text-fg-muted">{entry.period}</span>
              </div>
              <p className="text-sm font-medium text-accent">{entry.institution}</p>
              {entry.summary ? (
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                  {entry.summary}
                </p>
              ) : null}
            </article>
          ))}
        </Section>
      ) : null}

      {certifications.length > 0 ? (
        <Section title="Certifications">
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
            {certifications.map((certification) => (
              <li key={certification.id}>
                <span className="text-fg">{certification.title}</span>
                {certification.issuer ? ` — ${certification.issuer}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </main>
  );
}
