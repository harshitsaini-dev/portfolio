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
    *public* site's media route, so whatever the editor chooses in Settings is
    what both tabs show, and changing it changes both at once.

    Cross-origin on purpose. The admin cannot serve this itself — its own
    `/media/[id]` route is behind Cloudflare Access, so a browser fetching a
    favicon (no Access cookie on that request in every case) would get the
    login page instead of an image. The public URL has no such gate, and a
    favicon is public by nature.

    `NEXT_PUBLIC_SITE_ORIGIN` rather than a hard-coded host: the public site
    moves to a custom domain eventually, and a literal workers.dev URL here
    would quietly keep pointing at the old one. Unset means no icon rather
    than a broken one.
  */
  icons: process.env.NEXT_PUBLIC_SITE_ORIGIN
    ? {
        icon: [{ url: `${process.env.NEXT_PUBLIC_SITE_ORIGIN}/favicon` }],
        apple: [{ url: `${process.env.NEXT_PUBLIC_SITE_ORIGIN}/favicon` }],
      }
    : undefined,
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
