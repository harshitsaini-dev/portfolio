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
  /**
   * Keep `wrangler` out of the bundle.
   *
   * `src/lib/db/binding.ts` dynamically imports it to obtain a local D1
   * binding during development. Turbopack resolves dynamic imports
   * statically, so this is not cosmetic — removing the line was measured,
   * and `next build` fails with:
   *
   *   Import trace: Server Component:
   *     wrangler/wrangler-dist/cli.js
   *     → src/lib/db/binding.ts
   *     → src/app/(protected)/projects/[id]/page.tsx
   *
   * i.e. the bundler pulls the entire Wrangler CLI into the production
   * Server Component graph. Marking it external leaves it as a runtime
   * `require` instead, resolved only if the development branch executes.
   *
   * That branch cannot execute in production: `getAdminDatabase()` throws
   * when `NODE_ENV === "production"` before reaching the resolver that
   * contains the import, and Next inlines that comparison at build time.
   * `scripts/db-composition-tests.mjs` asserts both halves — the runtime
   * throw, and that `wrangler` is referenced exactly once, dynamically,
   * inside the development-only resolver, and is a devDependency.
   */
  serverExternalPackages: ["wrangler"],

  /**
   * Server Action request bodies up to 11MB.
   *
   * The framework default is 1MB, and every upload goes through a Server
   * Action — so the default silently contradicted this project's own upload
   * policy, which promises 5MB images and 10MB PDFs
   * (`packages/schemas/src/media.ts`). Any file past 1MB threw at the
   * framework layer, before the action's typed error handling could run,
   * and surfaced as the generic error page instead of a form message.
   *
   * 11MB = the 10MB policy ceiling plus multipart framing. The policy in
   * the schemas package stays the real limit; this is transport clearance,
   * not a second policy.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
