import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy for the admin, with a per-request nonce.
 *
 * The same shape as the public site's, deliberately stricter in three places,
 * because this app has no 3D scene and nothing here is public:
 *
 *   * no `worker-src blob:` — nothing spawns a worker;
 *   * no `blob:` in `img-src` — uploads are read as object URLs only in the
 *     preview, which is `data:`;
 *   * `frame-src 'none'`, since the admin embeds nothing at all.
 *
 * It is duplicated rather than shared with `apps/web` for the same reason the
 * two `next.config.ts` header lists are: the policies genuinely differ, the
 * differences are the interesting part, and a shared module would hide them
 * behind options. `@portfolio/config` is a tsconfig package with no runtime
 * entry, and giving it one to save thirty lines would mean a new workspace
 * export in both apps' module graphs — the exact change that has broken the
 * dev servers three times with Turbopack's cached failed resolutions.
 *
 * Authentication is not this file's job. Cloudflare Access sits in front of
 * the whole app and every Server Action re-verifies independently; a CSP is
 * about what the page may load once it is already being rendered for someone
 * allowed to see it.
 */
export function middleware(request: NextRequest) {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Read at runtime: the value is a Worker variable, and this policy has to
  // name the origin the tab icon comes from.
  //
  // The dev fallback matches `layout.tsx` exactly, and has to: the layout
  // points the icon at localhost:3000 during `next dev`, and a policy that
  // only listed the production origin blocked it there — measured, as three
  // CSP violations in the local admin's console. Two places deriving the same
  // origin differently is how that happens, so they derive it the same way.
  const siteOrigin =
    process.env.SITE_ORIGIN ??
    (isDevelopment ? "http://localhost:3000" : undefined);


  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // As on the public site: `next/font` emits an inline style block the
    // framework gives no way to nonce. A known, bounded relaxation.
    "style-src 'self' 'unsafe-inline'",
    // `data:` covers Tailwind's inline SVGs and the client-side preview of an
    // image an editor has selected but not yet uploaded.
    //
    // The public site's origin is listed because the admin's tab icon is the
    // CMS favicon, served from there. `img-src` governs favicons too: with
    // `'self' data:` alone the browser silently refused to load it, which is
    // why the icon stayed generic long after the link was correct in the
    // HTML. Narrow on purpose — one origin, images only, and it is the site
    // this CMS already edits.
    `img-src 'self' data:${siteOrigin ? ` ${siteOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    // Every form in the admin posts to this origin. Anything else is either a
    // mistake or an exfiltration attempt.
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
