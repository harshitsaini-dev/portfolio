import type { Metadata } from "next";

import { getPublicSiteOrigin } from "@/lib/site-origin";
import { headers } from "next/headers";
import { THEME_INIT_SCRIPT } from "@portfolio/ui/theme";
import { Geist, Geist_Mono } from "next/font/google";
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
 * Admin metadata.
 *
 * `noindex, nofollow` applies to the whole app: a CMS has no business in
 * search results, and following links from it would expose the route
 * structure. Set at the root so a new page inherits it rather than needing
 * to remember.
 *
 * No identity, email, or claim ever appears here — metadata is rendered
 * into the HTML head and would be trivially scrapable.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Portfolio Admin",
    description: "Content management for the portfolio.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  /*
    The same icon as the public site.

    Not a copy of the file and not a second upload: the URL points at the
    public site's stable `/site-icon`, so whatever the editor chooses in
    Settings is what both tabs show, and changing it changes both at once.

    Cross-origin on purpose. The admin cannot serve this itself — its own
    `/media/[id]` route is behind Cloudflare Access, so a browser fetching a
    favicon would get the login page instead of an image. The public URL has
    no such gate, and a favicon is public by nature.

    This is `generateMetadata`, not a static `metadata` object, and that is
    the second half of the same bug: a static metadata export is evaluated at
    BUILD time, where a Worker variable does not exist. Only a function runs
    per request.

    `SITE_ORIGIN`, deliberately NOT `NEXT_PUBLIC_SITE_ORIGIN`. The first
    version used the public prefix and the icon never appeared: Next inlines
    `NEXT_PUBLIC_*` at BUILD time, and this value is a Worker variable that
    only exists at RUNTIME, so the build substituted `undefined` and the link
    was never emitted. Metadata is rendered on the server, so an ordinary
    runtime read is both correct and enough.
  */
    icons: (() => {
      // One shared resolver — see `lib/site-origin.ts` for why this is not
      // inlined here any more.
      const origin = getPublicSiteOrigin();
      if (!origin) return undefined;
      return {
        icon: [{ url: `${origin}/site-icon` }],
        apple: [{ url: `${origin}/site-icon` }],
      };
    })(),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The nonce the middleware minted for this request. The CSP here is
  // `strict-dynamic` with no `unsafe-inline`, so an inline script without it
  // is refused — which is the intended behaviour and not a thing to work
  // around.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      /*
        The pre-paint script writes `data-theme` before React sees the
        document, so React finds the live DOM different from the HTML it sent
        and warns — correctly by its own rules, and uselessly here, because
        that difference is the entire purpose of the script. Measured as a
        hydration error on every admin page once the toggle had been used.

        Scoped to this element. `suppressHydrationWarning` does not cascade,
        so every other mismatch in the app is still reported — using it
        anywhere the difference was not deliberate would be hiding a bug
        rather than declaring intent.
      */
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/*
          Applies a stored theme choice before the first paint.

          The same script the public site runs, from the same module — see
          `@portfolio/ui/theme`. It has to be inline and synchronous: by the
          time React hydrates, the page has already been painted, so an editor
          who chose dark would get a white flash on every navigation between
          CMS pages. `dangerouslySetInnerHTML` is the only way to emit one, and
          it is safe because the script interpolates nothing — the only value
          in it is a constant key, and the only thing it writes to the DOM is
          one of two hard-coded strings behind an equality check.
        */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
