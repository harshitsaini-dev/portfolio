import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { accentCustomProperties } from "@portfolio/ui";

import { screenAccentProperties } from "@/lib/screen-accent";

import { Analytics } from "@/components/analytics";
import { EasterEggs } from "@/components/easter-eggs";
import { OfflineWatcher } from "@/components/offline/offline-watcher";
import { ServiceWorker } from "@/components/offline/service-worker";
import { getSiteContent } from "@/lib/content/site-content";
import { absoluteMediaUrl, getSiteOrigin } from "@/lib/site-origin";
import { THEME_INIT_SCRIPT } from "@portfolio/ui/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Nothing on this site can be prerendered, because the layout reads the CMS.
 *
 * Without this the build fails on `/_not-found`, which Next prerenders by
 * default: the layout resolves a D1 binding, and the composition seam
 * correctly refuses to hand one out in a production build. That refusal is
 * the seam working, not a bug to route around — the fix is to say that the
 * tree is dynamic, which it now is.
 *
 * The home and project pages already declared this individually. Declaring it
 * here covers the routes that have no page of their own, and is the honest
 * statement: every response depends on the database.
 */
export const dynamic = "force-dynamic";

/**
 * Site metadata, from the CMS.
 *
 * Safe to read here in a way it is not in the admin: every field this reads
 * is published content by definition. The admin's rule — that route metadata
 * is evaluated independently of the component, so a page guard cannot protect
 * it — does not apply to a site with no guard to bypass.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [content, origin] = await Promise.all([getSiteContent(), getSiteOrigin()]);

  // The image chosen in the CMS under "Link preview image", falling back to
  // the portrait.
  //
  // The fallback is what makes the setting optional rather than a chore: a
  // link shared before anyone picks anything still carries a face, which is
  // the right default for a portfolio. But a card is 1.91:1 and a portrait is
  // not, so the crop is always a compromise — the setting exists so it does
  // not have to be.
  const shareImage = content.shareImage ?? content.profile.image;

  return {
    // Everything relative below is resolved against this. Without it Next
    // emits `og:image` as a path, which no social network can fetch — a
    // share card that fails silently and only in someone else's app.
    metadataBase: new URL(origin),
    title: content.siteName,
    description: content.siteDescription ?? undefined,
    // One canonical URL for the site's front door, so a link shared with a
    // tracking query does not read as a separate page.
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: content.siteName,
      title: content.siteName,
      description: content.siteDescription ?? undefined,
      images: shareImage
        ? [
            {
              url: absoluteMediaUrl(origin, shareImage.id),
              width: shareImage.width ?? undefined,
              height: shareImage.height ?? undefined,
              // The stored description, not a generated one. It is the same
              // sentence a screen reader gets, and writing a second one here
              // would be a second thing to keep true.
              alt: shareImage.alt,
            },
          ]
        : undefined,
    },
    twitter: {
      // `summary_large_image` rather than `summary`: the small card crops a
      // portrait to a thumbnail beside the text, which is the least useful
      // thing a photograph can be.
      card: shareImage ? "summary_large_image" : "summary",
      title: content.siteName,
      description: content.siteDescription ?? undefined,
      images: shareImage ? [absoluteMediaUrl(origin, shareImage.id)] : undefined,
    },
    // Declared through Next's metadata rather than a hand-written <link>.
    //
    // This does NOT replace the convention-based `src/app/favicon.ico`:
    // measured, the page emits both, that file first and this one second.
    // Browsers use the last suitable declaration, so the CMS icon is the one
    // that shows — and the file stays as the fallback for a site whose
    // settings have no favicon, which is why it is not deleted.
    //
    // The type comes from the stored row rather than being inferred from the
    // URL, which has no extension to infer from.
    //
    // `apple` as well as `icon`, because they reach different browsers. The
    // owner reported the favicon showing on a laptop and missing on a phone,
    // and the served HTML confirmed why: only `rel="icon"` was emitted, and
    // mobile browsers — iOS Safari everywhere, Android for the home screen
    // and task switcher — look for `apple-touch-icon` and ignore the plain
    // icon link. Same asset for both: serving the original and letting the
    // device scale beats maintaining a second upload nobody will remember to
    // update.
    icons: content.theme.favicon
      ? {
          icon: [{ url: content.theme.favicon.href, type: content.theme.favicon.type }],
          apple: [{ url: content.theme.favicon.href, type: content.theme.favicon.type }],
        }
      : undefined,
  };
}

/**
 * The root layout, and the one place the theme settings are applied.
 *
 * ## `data-theme`, and why only sometimes
 *
 * `tokens.css` reserves `:root[data-theme="light"|"dark"]` for exactly this.
 * The attribute is set only when the editor pinned a theme — `system` leaves
 * it off, so `prefers-color-scheme` decides, which is what "system" means.
 * Writing `data-theme="system"` would match no rule and only look like it did
 * something.
 *
 * ## The accent is an inline custom property, never CSS text
 *
 * `accentCustomProperties()` returns an object for React's `style` prop, so
 * the editor's value never enters a stylesheet as text and there is no syntax
 * to escape into. The schema already restricts it to `#rrggbb`; this
 * restricts what could be done with it if that ever failed. The project's
 * rule is that the admin controls a theme configuration, not arbitrary CSS,
 * and this is where that rule is kept.
 *
 * An inline style beats every selector, so one stored accent overrides both
 * the light and dark values from `tokens.css`. That is the known cost of a
 * single `accent_color` column — see `packages/ui/src/accent.ts`, and the
 * contrast warning the admin shows because of it.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme, consoleEgg, isKonamiEnabled, screenAccents } =
    await getSiteContent();

  // Set by `middleware.ts`. The inline theme script below is the one script on
  // the page Next does not stamp for us, so without this the CSP blocks it and
  // every visitor with a stored preference gets a flash of the site default.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      /*
        The one element the browser is *expected* to have changed before React
        arrives.

        The script below rewrites `data-theme` from the site default to the
        visitor's stored choice, ahead of the first paint. React then compares
        the server's HTML against the live DOM, finds the attribute different,
        and warns — correctly, by its own rules, and uselessly here: the
        difference is the entire point of the script.

        Scoped to this element only. `suppressHydrationWarning` does not
        cascade to children, so every other mismatch on the page is still
        reported. Using it anywhere the difference was not deliberate would be
        hiding a bug rather than declaring intent.
      */
      suppressHydrationWarning
      data-theme={theme.defaultTheme === "system" ? undefined : theme.defaultTheme}
      /*
        The site accent, plus one set of custom properties per system screen.

        The 404 and the error boundary render inside this layout and cannot be
        handed props by it, so their colours travel as variables instead. That
        also keeps both pages free of a database read — an unknown URL is the
        most common thing a scanner asks for, and it should not cost a query.

        `screenAccentProperties` emits nothing for a screen with no override,
        so the fallback in each screen's own style resolves to the site accent
        and there is no empty custom property to reason about.
      */
      style={{
        ...(theme.accentColor
          ? accentCustomProperties(theme.accentColor)
          : undefined),
        ...screenAccentProperties("offline", screenAccents.offline),
        ...screenAccentProperties("not-found", screenAccents.notFound),
        ...screenAccentProperties("error", screenAccents.error),
      }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies a stored theme preference before the first paint.

          `data-theme` above is the *site's* default, from the CMS. This lets
          one visitor override it — and it has to run here, synchronously,
          ahead of React. A component cannot: by the time it hydrates the page
          has already been painted in the default theme, so someone who chose
          dark would see a white flash on every navigation.

          `dangerouslySetInnerHTML` is the only way to emit an inline script,
          and the name is worth taking seriously. It is safe here because the
          script interpolates nothing — see `@portfolio/ui/theme`, where the only
          value in it is a constant key and the only thing written to the DOM
          is one of two hard-coded strings behind an equality check.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Renders no markup at all — it is an effect that posts one beacon
            per route. Mounted here so it survives every page. */}
        <Analytics />
        {/* Renders nothing. A console note and the Konami code — see the
            component; neither hides content nor blocks a key. */}
        {/* Content, from the CMS — see the component for why a console
            message counts as content. */}
        <EasterEggs console={consoleEgg} isKonamiEnabled={isKonamiEnabled} />
        {/* Both render nothing until they have something to do. The worker
            gives a cold visit an offline page instead of the browser's error
            screen; the watcher covers a tab that was already open when the
            connection went. */}
        <ServiceWorker />
        <OfflineWatcher />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
