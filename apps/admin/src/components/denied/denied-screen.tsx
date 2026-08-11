"use client";

/**
 * The access-denied screen.
 *
 * Composes `AdminScreen`, which is the admin's half of the shell the public
 * site's three dead ends use. What belongs to *this* screen lives here: the
 * auth log, the padlock, and the code cracker.
 *
 * ## The words stay deliberately vague
 *
 * The original page said access was denied and not *why*, and that reasoning
 * survives the redesign: "expired token", "wrong audience" or "development
 * auth is not enabled" each tell someone exactly which part of their attempt
 * to change. The log has the reason. The log is not this page.
 *
 * ## The lock is a drawing and the game is a toy
 *
 * Neither is connected to anything. The real boundary is Cloudflare Access in
 * front of the Worker, and cracking the four-digit code opens a line of
 * monospace, not a door.
 */

import { AdminScreen, type AdminScreenLine } from "@/components/system/admin-screen";
import { CodeCracker } from "@portfolio/ui/components/code-cracker";

/** Decorative. It names no reason, for the reason given above. */
const LINES: readonly AdminScreenLine[] = [
  { text: "$ auth --verify", tone: "prompt" },
  { text: "checking access token...", tone: "muted" },
  { text: "checking policy...", tone: "muted" },
  { text: "[DENIED] no valid session for this area", tone: "alert" },
  { text: "[INFO] the reason is in the server log, not here", tone: "muted" },
];

export function DeniedScreen({ accent }: { accent: string | null }) {
  return (
    <AdminScreen
      accent={accent}
      mascot="lock"
      status="Not signed in"
      headlinePrefix="Access"
      headline="denied"
      terminalTitle="auth.log"
      lines={LINES}
      footer={
        <div className="mt-2 w-full">
          <CodeCracker />
        </div>
      }
    >
      You are not signed in to an account with access to this administration
      area. Access is managed through Cloudflare Access — if you believe this is
      a mistake, contact the site owner.
    </AdminScreen>
  );
}
