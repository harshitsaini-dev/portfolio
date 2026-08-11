"use client";

/**
 * Registers the service worker.
 *
 * ## Production only
 *
 * In development the dev server rebuilds chunks constantly under paths that
 * look immutable and are not, so a worker caching `/_next/static/*` would hand
 * back yesterday's module and produce a class of bug that is very hard to
 * recognise as caching. There is nothing to gain from it locally either — the
 * offline page can be exercised directly, and the worker itself against a
 * production build.
 *
 * ## After load, never during
 *
 * Registration competes for the network with the page that is still arriving,
 * and the worker is useless on this visit anyway — it is for the next one. So
 * it waits for `load`. On a repeat visit an already-installed worker is
 * controlling the page long before this component runs.
 *
 * ## Failure is silent on purpose
 *
 * A registration that fails leaves the site exactly as it was before any of
 * this existed. There is nothing for the visitor to do about it, so there is
 * nothing to tell them.
 */

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Private windows, disabled storage, an unsupported browser — all of
        // them mean "no offline page", which is where this site started.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
