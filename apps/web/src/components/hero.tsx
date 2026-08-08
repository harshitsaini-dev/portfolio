import { PlaceholderAction } from "@/components/placeholder-action";
import { Container } from "@/components/ui/container";
import { ContentImage } from "@/components/ui/content-image";
import { SocialRow } from "@/components/ui/social-row";
import { actionVariant } from "@/components/ui/action";
import { type } from "@/components/ui/typography";
import type {
  ContactCallToAction,
  Profile,
  ResumeLink,
  SocialProfile,
} from "@/data/types";

interface HeroProps {
  profile: Profile;
  contact: ContactCallToAction;
  socials: readonly SocialProfile[];
  resume: ResumeLink | null;
}

/**
 * HTML-first hero. Carries the page's single `<h1>`.
 *
 * No canvas by design: the future 3D hero layers *behind* this markup and
 * must never become the only way to read the name, role, or calls to action.
 *
 * ## Layout
 *
 * A two-column composition above `lg`, portrait beside the text, collapsing
 * to a single column below. The portrait is **second in the DOM** and pulled
 * into place with `order`, so a screen reader and a keyboard reach the name
 * and the actions before a decorative photograph.
 *
 * The one sanctioned glow on the site sits here — a single soft accent wash
 * behind the heading, on a decorative element hidden from assistive
 * technology and dropped entirely at mobile widths.
 */
export function Hero({ profile, contact, socials, resume }: HeroProps) {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden"
    >
      {/* Decorative accent wash. Purely presentational. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-0 hidden h-96 w-96 rounded-full bg-accent-soft blur-3xl sm:block"
      />

      <Container className="relative py-20 sm:py-24 lg:py-32">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
          <div className="min-w-0 flex-1">
            {/*
              Availability reads as a status, so it gets the shape of one.
              The dot is decorative: the text beside it carries the meaning,
              and a coloured dot alone would convey nothing to a screen reader
              or to anyone who cannot distinguish it from the border.
            */}
            {profile.availability ? (
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-accent"
                />
                {profile.availability}
              </p>
            ) : null}

            <p className={type.eyebrow}>{profile.role}</p>

            <h1 id="hero-heading" className={`mt-4 ${type.display}`}>
              {profile.name}
            </h1>

            {profile.tagline ? (
              <p className={`mt-6 max-w-xl ${type.lead}`}>{profile.tagline}</p>
            ) : null}

            {profile.location ? (
              <p className={`mt-6 ${type.meta}`}>{profile.location}</p>
            ) : null}

            <div className="mt-10 flex flex-wrap items-start gap-3">
              <PlaceholderAction
                action={contact.primaryAction}
                variant="primary"
                context="hero"
              />
              {resume ? (
                <a
                  href={resume.href}
                  // The route serves the PDF inline, so this opens rather than
                  // downloads. A visitor who wants the file can still save it,
                  // and reading it in place is the more common intent.
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors duration-150 ${actionVariant.quiet}`}
                >
                  {resume.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>

            {socials.length > 0 ? (
              <div className="mt-8">
                <SocialRow socials={socials} label="Profiles elsewhere" />
              </div>
            ) : null}
          </div>

          {profile.image ? (
            <div className="order-first shrink-0 lg:order-none">
              <ContentImage
                image={profile.image}
                size={224}
                radius="rounded-2xl"
                className="border border-subtle shadow-md"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
