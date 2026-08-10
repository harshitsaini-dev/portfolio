"use client";

/**
 * The last-resort boundary, for when the root layout itself fails.
 *
 * ## Why `error.tsx` is not enough
 *
 * `app/error.tsx` renders *inside* the root layout, so it only catches errors
 * thrown below it. The outage on 2026-08-09 was not below it: `getSiteContent()`
 * fails in the layout's own `generateMetadata`, which means the layout never
 * produced a tree for a boundary to sit in. Exactly the class of failure most
 * worth catching was the class `error.tsx` cannot see.
 *
 * This one replaces the layout, which is why it renders its own `<html>` and
 * `<body>`.
 *
 * ## Inline styles, on purpose
 *
 * The palette lives in `globals.css`, which the root layout imports — the file
 * that just failed. Depending on it here would risk this page rendering
 * unstyled in precisely the situation it exists for. These few declarations
 * are duplicated from the dark theme's tokens and are the one place in this
 * codebase where that duplication is the right call: a fallback that depends
 * on the thing it is falling back from is not a fallback.
 *
 * It deliberately does not read `error.message` — see `error.tsx` for why.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error above the root layout", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#0b0c0f",
          color: "#f1f2f5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          This site is temporarily unavailable
        </h1>

        <p style={{ margin: 0, maxWidth: "34rem", color: "#a5a7b3" }}>
          Something failed before the page could be built. It is being looked
          at — please try again in a moment.
        </p>

        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: "0.375rem",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#0b0c0f",
            background: "#7dd3fc",
            cursor: "pointer",
          }}
        >
          Try again
        </button>

        {error.digest ? (
          <p
            style={{
              margin: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              color: "#a5a7b3",
            }}
          >
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
