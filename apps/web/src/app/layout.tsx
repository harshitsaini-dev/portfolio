import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { accentCustomProperties } from "@portfolio/ui";

import { getSiteContent } from "@/lib/content/site-content";
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
  const content = await getSiteContent();
  return {
    title: content.siteName,
    description: content.siteDescription ?? undefined,
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
    icons: content.theme.favicon
      ? { icon: [{ url: content.theme.favicon.href, type: content.theme.favicon.type }] }
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
  const { theme } = await getSiteContent();

  return (
    <html
      lang="en"
      data-theme={theme.defaultTheme === "system" ? undefined : theme.defaultTheme}
      style={
        theme.accentColor ? accentCustomProperties(theme.accentColor) : undefined
      }
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
