import { PlaceholderAction } from "@/components/placeholder-action";
import { Container } from "@/components/ui/container";
import { ContentImage } from "@/components/ui/content-image";
import { type } from "@/components/ui/typography";
import type { ContactCallToAction, Profile } from "@/data/types";

interface HeroProps {
  profile: Profile;
  contact: ContactCallToAction;
}

/**
 * HTML-first hero. Carries the page's single `<h1>`.
 *
 * No canvas by design: the future 3D hero layers *behind* this markup and
 * must never become the only way to read the name, role, or calls to action.
 * The one sanctioned glow on the site sits here — a single soft accent wash
 * behind the heading, rendered on a decorative element that is hidden from
 * assistive technology and disappears entirely at mobile widths.
 */
export function Hero({ profile, contact }: HeroProps) {
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

      <Container className="relative py-20 sm:py-28 lg:py-32">
        {profile.image ? (
          <ContentImage
            image={profile.image}
            size={96}
            radius="rounded-full"
            className="mb-8 border border-subtle"
          />
        ) : null}

        <p className={type.eyebrow}>{profile.role}</p>

        <h1 id="hero-heading" className={`mt-5 ${type.display}`}>
          {profile.name}
        </h1>

        <p className={`mt-6 max-w-xl ${type.lead}`}>{profile.tagline}</p>

        {/* A definition list of empty values is worse than no list: it
            announces "Location" to a screen reader and then says nothing.
            Each row appears only when the editor filled it in, and the list
            disappears entirely when neither is set. */}
        {profile.location || profile.availability ? (
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {profile.location ? (
              <div>
                <dt className={type.fine}>Location</dt>
                <dd className="mt-1 text-sm font-medium text-fg">
                  {profile.location}
                </dd>
              </div>
            ) : null}
            {profile.availability ? (
              <div>
                <dt className={type.fine}>Availability</dt>
                <dd className="mt-1 text-sm font-medium text-fg">
                  {profile.availability}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-12 flex flex-wrap items-start gap-4">
          <PlaceholderAction
            action={contact.primaryAction}
            variant="primary"
            context="hero"
          />
          <PlaceholderAction action={contact.secondaryAction} context="hero" />
        </div>
      </Container>
    </section>
  );
}
