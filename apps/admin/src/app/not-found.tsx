import type { Metadata } from "next";

import {
  AdminScreen,
  type AdminScreenLine,
} from "@/components/system/admin-screen";
/* The same maze the public site's 404 shows, loaded in the browser — see
   the wrapper for why the dynamic import cannot live in this file. */
import { LazyMazeGame } from "@/components/system/screen-games";
import { getScreenAccent } from "@/lib/site-accent";

export const metadata: Metadata = {
  title: "Not found · Portfolio Admin",
};

/**
 * The admin's 404 — which is the site's 404.
 *
 * There are four system screens in this project, not six: offline, not found,
 * something broke, and access denied. An admin that had its *own* idea of what
 * "not found" looks like would be a fifth, and the two would drift the first
 * time one of them was improved.
 *
 * So this is the same figure, the same log, the same game and the same words.
 * The only thing that differs is where the way out goes, which is not a
 * different screen — it is the same screen knowing which app it is in.
 *
 * It reads its accent, unlike the public site's 404. That page avoids the
 * query because an unknown URL is the most common thing a scanner requests;
 * this Worker sits behind Cloudflare Access, so a scanner never reaches the
 * application at all. The colour comes from the same "Not-found (404)" setting
 * the public site uses — one decision, both apps.
 */
const LINES: readonly AdminScreenLine[] = [
  { text: "$ resolve", tone: "prompt" },
  { text: "checking routes...", tone: "muted" },
  { text: "[404] no route matches", tone: "alert" },
  { text: "[INFO] it may have moved, or never existed", tone: "muted" },
];

export default async function NotFound() {
  const accent = await getScreenAccent("notFound");

  return (
    <AdminScreen
      accent={accent}
      mascot="compass"
      status="Error 404"
      headlinePrefix="Page"
      headline="not found"
      terminalTitle="route_resolver.sh"
      lines={LINES}
      actions={
        // A document load rather than `next/link`: this page renders outside
        // the protected layout, so a client navigation would re-enter a router
        // tree it was never part of.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to the dashboard
        </a>
      }
      footer={
        <div className="mt-2 w-full">
          <LazyMazeGame />
        </div>
      }
    >
      That address does not lead anywhere.
    </AdminScreen>
  );
}
