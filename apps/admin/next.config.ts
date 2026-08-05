import type { NextConfig } from "next";

/**
 * Security headers for the admin app.
 *
 * Only well-understood, non-breaking headers are set here. Notably **no
 * Content-Security-Policy**: a CSP strict enough to be worth having needs a
 * nonce wired through Next's script loading, and getting it wrong silently
 * breaks the app in ways that are painful to debug. Next.js documents a
 * nonce-based approach, and this project has a dedicated security phase
 * (Phase 21) and deployment phase (Phase 22) where CSP can be introduced
 * and actually verified in a browser. Adding a guessed CSP now would be
 * worse than none — see docs/DECISIONS.md.
 *
 * `X-Frame-Options: DENY` matters most here: it stops the admin UI being
 * framed for clickjacking, which is the realistic attack against a CMS
 * whose users are already authenticated.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // The admin UI needs none of these; denying them shrinks the attack
  // surface if a dependency ever tries.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Belt and braces alongside the `robots` metadata: a header covers
  // non-HTML responses too.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
