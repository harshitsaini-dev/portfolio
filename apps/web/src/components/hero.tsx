import { PlaceholderAction } from "@/components/placeholder-action";
import type { ContactCallToAction, Profile } from "@/data/types";

interface HeroProps {
  profile: Profile;
  contact: ContactCallToAction;
}

/**
 * HTML-first hero. This carries the page's single <h1>.
 *
 * There is no canvas here by design: the future 3D hero (Phase 14) layers
 * behind this markup and must never become the only way to read the name,
 * role, or calls to action.
 */
export function Hero({ profile, contact }: HeroProps) {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
    >
      <p className="text-sm font-medium text-muted">{profile.role}</p>
      <h1
        id="hero-heading"
        className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
      >
        {profile.name}
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted sm:text-xl">
        {profile.tagline}
      </p>

      <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted">Location</dt>
          <dd className="font-medium">{profile.location}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">Availability</dt>
          <dd className="font-medium">{profile.availability}</dd>
        </div>
      </dl>

      <div className="mt-10 flex flex-wrap items-start gap-4">
        <PlaceholderAction
          action={contact.primaryAction}
          variant="primary"
          context="hero"
        />
        <PlaceholderAction action={contact.secondaryAction} context="hero" />
      </div>
    </section>
  );
}
