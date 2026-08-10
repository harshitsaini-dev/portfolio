import type { Metadata } from "next";
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
export const metadata: Metadata = {
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

    `SITE_ORIGIN`, deliberately NOT `NEXT_PUBLIC_SITE_ORIGIN`. The first
    version used the public prefix and the icon never appeared: Next inlines
    `NEXT_PUBLIC_*` at BUILD time, and this value is a Worker variable that
    only exists at RUNTIME, so the build substituted `undefined` and the link
    was never emitted. Metadata is rendered on the server, so an ordinary
    runtime read is both correct and enough.
  */
  icons: (() => {
    const origin =
      process.env.SITE_ORIGIN ??
      // A working default for `next dev`, where the public site is the
      // sibling process on port 3000 and no variable is configured.
      (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
    if (!origin) return undefined;
    return {
      icon: [{ url: `${origin}/site-icon` }],
      apple: [{ url: `${origin}/site-icon` }],
    };
  })(),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
