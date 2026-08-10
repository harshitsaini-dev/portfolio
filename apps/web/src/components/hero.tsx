import { PlaceholderAction } from "@/components/placeholder-action";
import { Container } from "@/components/ui/container";
import { Magnetic } from "@/components/ui/magnetic";
import { SocialRow } from "@/components/ui/social-row";
import { RotatingTypewriter } from "@/components/ui/rotating-typewriter";
import { Typewriter } from "@/components/ui/typewriter";
import { XrayPortrait } from "@/components/ui/xray-portrait";
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
export function Hero({
  profile,
  contact,
  socials,
  resume,
}: HeroProps) {
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
              <p className="rise rise-1 mb-6 inline-flex items-center gap-2 rounded-full border border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-accent"
                />
                {profile.availability}
              </p>
            ) : null}

            {/* The role types itself; the name does not. Delaying the one
                thing a visitor came to read behind an effect is the wrong
                trade, and an h1 that arrives letter by letter is worse for
                anyone scanning. */}
            {/* One phrase stays the server-rendered CSS typewriter; several
                become the rotating client one. The branch is here rather than
                inside a single component so a site that configures no
                alternates ships no client component for this label at all. */}
            <p className={`rise rise-2 ${type.eyebrow}`}>
              {profile.roleAlternates.length > 0 ? (
                <RotatingTypewriter
                  phrases={[profile.role, ...profile.roleAlternates]}
                />
              ) : (
                <Typewriter text={profile.role} />
              )}
            </p>

            <h1 id="hero-heading" className={`rise rise-3 mt-4 ${type.display}`}>
              {profile.name}
            </h1>

            {profile.tagline ? (
              <p className={`rise rise-4 mt-6 max-w-xl ${type.lead}`}>{profile.tagline}</p>
            ) : null}

            {profile.location ? (
              <p className={`mt-6 ${type.meta}`}>{profile.location}</p>
            ) : null}

            {/* The two things a visitor is most likely to want. Both are
                wrapped rather than replaced: the magnet is a transform on a
                span around each control, so the anchor keeps its own hit area,
                focus ring and behaviour, and the effect disappears entirely on
                touch and under reduced motion. */}
            <div className="rise rise-5 mt-10 flex flex-wrap items-start gap-3">
              <Magnetic>
                <PlaceholderAction
                  action={contact.primaryAction}
                  variant="primary"
                  context="hero"
                />
              </Magnetic>
              {resume ? (
                <Magnetic>
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
                </Magnetic>
              ) : null}
            </div>

            {socials.length > 0 ? (
              <div className="mt-8">
                <SocialRow socials={socials} label="Profiles elsewhere" />
              </div>
            ) : null}
          </div>

          {profile.image ? (
            /*
              The portrait, designed for a **cut-out** — a transparent PNG of
              the person rather than a rectangular headshot.
              
              That decides the treatment. A frame, a border or a rounded panel
              would draw a box around something that has no edges, which is
              exactly what makes a cut-out look pasted on. So there is none:
              the figure stands on the page, with a soft accent glow behind it
              for separation from the background, and `object-contain` so it is
              never cropped.
              
              `order-first` puts it above the text on narrow screens while
              keeping it second in the DOM, so a screen reader and a keyboard
              reach the name and actions before a decorative photograph.
            */
            <div className="rise rise-3 relative order-first shrink-0 lg:order-none">
              {/* The glow. Decorative, behind, and the one place the sanctioned
                  accent wash appears at this size. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl sm:h-[32rem] sm:w-[32rem]"
              />
              {/*
                Wrapped so a machine-view layer can be revealed around the
                cursor — see `XrayPortrait`. The photograph itself is
                unchanged and is what remains on touch, under reduced motion,
                or with no JavaScript: the overlay is not rendered at all in
                those cases rather than rendered and hidden.
              */}
              <XrayPortrait
                image={profile.image}
                xrayImage={profile.xrayImage}
                /*
                  Sized in `rem` against the viewport rather than by the pixel
                  value above, which only reserves the box before the bytes
                  arrive. A cut-out is the second subject of the hero, not a
                  thumbnail beside it, so it is given the height to read as a
                  person.

                  The mask dissolves the base into the page.

                  A cut-out ends wherever the photograph was cropped, and that
                  edge is a hard horizontal line across the torso — the one
                  thing that gives away that a figure was pasted onto a
                  background. Fading the bottom sixth means there is no line to
                  notice: the figure simply stops being opaque.

                  Held fully opaque to 68% so nothing above the waist is
                  touched, and prefixed for WebKit because Safari still needs
                  it. A browser supporting neither gets the hard edge, which is
                  the current behaviour and never a missing photograph.
                */
                className="relative h-[26rem] w-auto object-contain drop-shadow-2xl [-webkit-mask-image:linear-gradient(to_bottom,black_68%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_68%,transparent_100%)] sm:h-[34rem] lg:h-[38rem]"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
