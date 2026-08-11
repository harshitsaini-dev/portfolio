"use client";

/**
 * The one system screen that lives on the admin, linked from the public site.
 *
 * ## Why the origin is derived rather than configured
 *
 * The admin is a separate Worker on a separate host, and the public site has
 * no reason to know its address — there is no binding, no environment
 * variable, and adding one for a workbench page would be configuration that
 * exists for one link.
 *
 * The two hosts are named as a pair (`portfolio-web…` and `portfolio-admin…`,
 * `:3000` and `:3001`), so this swaps one for the other. That is a guess about
 * a naming convention, and it is treated as one: when the pattern does not
 * match, the paths are printed as plain text instead of being turned into a
 * link that would go somewhere wrong.
 *
 * Linking to the admin from a public page is safe: it is behind Cloudflare
 * Access, so an unauthorised visitor gets the sign-in flow — which is itself
 * one of the screens this page is for.
 */

import { useSyncExternalStore } from "react";

/** `portfolio-web.example.workers.dev` → `portfolio-admin.example.workers.dev` */
function adminOriginFrom(location: Location): string | null {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    // The dev pair, which is fixed by the two `dev` scripts.
    return `${location.protocol}//${location.hostname}:3001`;
  }
  if (!location.hostname.includes("-web.")) return null;
  return `${location.protocol}//${location.hostname.replace("-web.", "-admin.")}`;
}

function readOrigin(): string | null {
  return adminOriginFrom(window.location);
}

/** Nothing to derive on the server: there is no `location` there. */
function serverOrigin(): string | null {
  return null;
}

function subscribe(): () => void {
  return () => {};
}

export function AdminScreenLinks() {
  const origin = useSyncExternalStore(subscribe, readOrigin, serverOrigin);
  const path = "/denied";
  const title = "Access denied";
  const game = "Code cracker";
  const description =
    "What someone without access sees, on the admin. It is behind Cloudflare Access, so opening this shows the sign-in flow first.";

  return (
    <li>
      {origin ? (
        <a
          href={`${origin}${path}`}
          className="flex flex-col gap-1 py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-base font-medium text-accent">{title}</span>
            <span className="font-mono text-xs text-fg-muted">{game}</span>
          </span>
          <span className="text-sm text-fg-muted">{description}</span>
        </a>
      ) : (
        /* The host could not be derived, so the path is printed rather than
           linked. A link that goes to the wrong place is worse than one that
           is not there. */
        <div className="flex flex-col gap-1 py-5">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-base font-medium text-fg">{title}</span>
            <span className="font-mono text-xs text-fg-muted">{game}</span>
          </span>
          <span className="text-sm text-fg-muted">
            {description} Open <code className="text-accent">{path}</code> on
            the admin.
          </span>
        </div>
      )}
    </li>
  );
}
