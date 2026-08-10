"use client";

/**
 * Share this page.
 *
 * ## Two behaviours, one button
 *
 * On a phone `navigator.share` opens the operating system's own share sheet —
 * WhatsApp, mail, whatever the visitor actually uses. Nothing this site could
 * build competes with that, and a row of hand-rolled network icons would be a
 * worse version of a thing the device already does well.
 *
 * Where that API does not exist (most desktop browsers) the button copies the
 * URL instead. Copying is what someone was going to do by hand anyway.
 *
 * ## No third-party share widgets
 *
 * The usual approach is an embedded script from each network, and every one of
 * them is a tracker that learns which page a visitor is reading. This is two
 * browser APIs and no network requests — which is also why the CSP needed no
 * change to allow it.
 *
 * ## The confirmation is announced, not just coloured
 *
 * A silent copy leaves the visitor unsure whether anything happened, and a
 * label that only changes colour says nothing to a screen reader. The status
 * text is a live region, so the change is spoken as well as seen, and it
 * reverts so the button does not read as permanently "Copied".
 */

import { Magnetic } from "@/components/ui/magnetic";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "shared" | "copied" | "failed";

const STATUS_LABELS: Readonly<Record<Status, string>> = {
  idle: "",
  shared: "Shared",
  copied: "Link copied",
  failed: "Couldn’t copy — the address bar has the link",
};

export function ShareButton({
  title,
  label = "Share",
  className = "",
}: {
  /** What the share sheet offers as the subject. */
  title: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount matters because the timer outlives a client-side
  // navigation away from the page, and setting state then warns.
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function announce(next: Status) {
    setStatus(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), 4000);
  }

  async function share() {
    // Read at click time, not at render: the canonical URL is what should be
    // shared, and `location.href` still carries any tracking query the visitor
    // arrived with — which would then spread with every share.
    const url =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ??
      window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        announce("shared");
        return;
      } catch {
        // Includes the visitor simply dismissing the sheet, which is not a
        // failure and must not be reported as one. Falling through to copy
        // would also be wrong — they chose not to share.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      announce("copied");
    } catch {
      // Clipboard access can be refused outright. Saying so beats a button
      // that appears to do nothing.
      announce("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      {/* Wrapped, not replaced: the button keeps its own hit area and focus
          ring, and the pull is purely visual. */}
      <Magnetic>
      <button
        type="button"
        onClick={() => void share()}
        className={`inline-flex items-center gap-2 rounded-md border border-subtle px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
      >
        {/* Decorative: the button's own text is the accessible name. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {label}
      </button>
      </Magnetic>

      {/*
        Always present, filled only when there is something to say. A live
        region added to the DOM at the moment it gains text is frequently not
        announced at all — the region has to exist first.
      */}
      <span
        role="status"
        aria-live="polite"
        className="text-sm text-fg-muted empty:hidden"
      >
        {STATUS_LABELS[status]}
      </span>
    </span>
  );
}
