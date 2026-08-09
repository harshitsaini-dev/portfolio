import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy, with a per-request nonce.
 *
 * This is the header `next.config.ts` deliberately left out, with the note
 * that "Phase 21 is where it gets added and actually verified". It lives here
 * rather than there because a nonce has to be generated per request, and
 * `headers()` in `next.config.ts` is static.
 *
 * ## Why a nonce and `strict-dynamic`
 *
 * The alternative is `'unsafe-inline'` in `script-src`, which is not a policy
 * so much as a decoration: it permits exactly the injected inline script a CSP
 * exists to stop. A nonce admits only the scripts this app emitted, and
 * `strict-dynamic` extends that trust to the chunks those scripts load — which
 * is how Next's client bundle works and why a host allowlist cannot express
 * it.
 *
 * ## Why `style-src` still allows inline
 *
 * `next/font` emits an inline `<style>` block, and nonce-ing it is not
 * something the framework exposes. An attacker who can inject a style can do
 * real but limited harm — mostly exfiltration through selectors — and the
 * honest position is that this is a known, bounded relaxation rather than
 * pretending the policy is stricter than it is.
 *
 * (React's `style` prop is not affected either way: it sets properties through
 * the CSSOM, which CSP does not govern.)
 *
 * ## Development needs two extra allowances
 *
 * Turbopack's HMR evaluates code (`'unsafe-eval'`) and talks over a websocket
 * (`ws:`). Both are gated on `NODE_ENV`, which Next inlines at build time, so
 * neither reaches a production bundle.
 */
export function middleware(request: NextRequest) {
  const isDevelopment = process.env.NODE_ENV !== "production";

  // `randomUUID` rather than a counter or a timestamp: a nonce that can be
  // predicted is a nonce that can be reused by whoever predicted it.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // `data:` for the inline SVGs Tailwind emits, `blob:` for anything the
    // 3D scene reads back off a canvas.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Three.js and drei load some helpers as blob workers.
    "worker-src 'self' blob:",
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // The modern spelling of `X-Frame-Options: DENY`, which stays in
    // `next.config.ts` for browsers that only understand the old one.
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // Next reads the nonce back out of this request header to stamp its own
  // script tags. Setting it only on the response would nonce nothing.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    /*
      Everything except static assets and images.

      A CSP on a chunk of JavaScript or a font file protects nothing — the
      header governs what a *document* may load — and generating a nonce for
      each of them would put a random value on responses that should be
      cacheable.
    */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
