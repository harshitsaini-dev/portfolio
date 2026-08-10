import type { NextConfig } from "next";

/**
 * Security headers for the public site.
 *
 * The admin's set, minus the two that would be wrong here. There is
 * deliberately **no `X-Robots-Tag`**: the admin is `noindex, nofollow`
 * because nobody should find it, whereas this site exists to be found.
 *
 * Also **no Content-Security-Policy**, for the reason recorded in the admin's
 * config and `docs/DECISIONS.md`: a CSP strict enough to be worth having
 * needs a nonce wired through Next's script loading, and a guessed one breaks
 * the app in ways that are painful to debug. Phase 21 is where it gets added
 * and actually verified.
 *
 * `X-Frame-Options: DENY` is kept: nothing here is meant to be embedded, and
 * a portfolio framed inside somebody else's page is only ever a
 * misrepresentation.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /*
    Two years, and no `preload`.

    The lifetime is long because a short one defeats the point: HSTS only
    protects a visitor who has already been here, and the header is what keeps
    the next visit from starting over plaintext.

    `preload` is deliberately absent. Submitting to the preload list is a
    claim about the **whole registrable domain**, and this app is a guest on
    `workers.dev` — a domain shared with every Worker anyone deploys. Making
    that claim is not this project's to make. It becomes worth revisiting on a
    custom domain, where the claim would be about a domain the owner owns.

    `includeSubdomains` is harmless here (no subdomains exist below this host)
    and correct on a custom domain, so it is set once rather than remembered
    later.
  */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // `strict-origin-when-cross-origin` rather than the admin's `no-referrer`:
  // outbound links to a visitor's project or profile should still carry the
  // origin, which is normal courtesy on a public site and reveals nothing.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  /**
   * Keep `wrangler` out of the bundle.
   *
   * `src/lib/dev-platform.ts` dynamically imports it to obtain local D1 and
   * R2 bindings during development. Turbopack resolves dynamic imports
   * statically, so this is not cosmetic — without it `next dev` fails
   * immediately on this app with:
   *
   *   ./node_modules/.../@cloudflare/workerd-windows-64/bin/workerd.exe
   *   Error: Unknown module type
   *
   * i.e. the bundler tries to parse the workerd binary as a module. Marking
   * it external leaves it a runtime `require`, resolved only if the
   * development branch executes.
   *
   * That branch cannot execute in production: both seams throw when
   * `NODE_ENV === "production"` before reaching the resolver that contains
   * the import, and Next inlines that comparison at build time. The admin's
   * config carries the same line for the same reason.
   */
  serverExternalPackages: ["wrangler"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
