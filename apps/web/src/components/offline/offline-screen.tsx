"use client";

/**
 * The offline screen.
 *
 * One component, two places: the `/offline` route the service worker serves
 * when a navigation fails, and the overlay that covers the page when an
 * already-open tab loses its connection. Two copies of this would be two
 * screens to keep in step, and the second one would be the one nobody
 * remembered to update.
 *
 * The shell — backdrop, robot, pill, headline, log — is `SystemScreen`, shared
 * with the 404 and the error page. What is particular to being offline lives
 * here: the ping log, the reconnect watch, and the puzzle.
 *
 * ## What it does not do
 *
 * It does not accuse anyone of anything, and it does not ask them to "check
 * your connection" — they know. It says what is true, shows that the site is
 * still watching for the network, and gives them something to do meanwhile.
 *
 * ## The game is a puzzle, not a score
 *
 * `SignalPuzzle` ends in a win rather than a leaderboard, which is the right
 * shape for somebody who is waiting: a reflex game with a timer would be one
 * more thing failing while their network is down. The site's snake stays where
 * it belongs, in the playground section.
 *
 * ## The host is read, not written
 *
 * The ping output names whatever host the visitor is actually on. Hardcoding
 * the production domain would print a lie on every preview deployment and on
 * localhost, and would have to be found and changed the day the site moves.
 *
 * ## It only leaves once it has seen a failure
 *
 * The first version probed on mount and navigated away the moment the probe
 * succeeded — so opening `/offline` while online bounced instantly to a blank
 * page, which is how the bug was found. Recovery only means something after a
 * failure, so the screen waits until it has watched one request fail before it
 * acts on one succeeding. The overlay says so up front: it only exists because
 * the browser fired `offline`.
 *
 * ## The reconnect is real
 *
 * `online` fires optimistically in every browser: it means an interface came
 * up, not that anything is reachable. So the screen confirms with an actual
 * request before it acts, and keeps polling quietly in case the event never
 * arrives — a captive portal or a flapping link produces exactly that.
 */

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/*
  Client-only, and deliberately so.

  The puzzle is scrambled with `Math.random()`, so a server render and a client
  render produce different boards and React reports a hydration mismatch — the
  first version did exactly that. A game is browser-side by nature; there is
  nothing for the server to contribute and nothing worth putting in the HTML
  that gets precached.
*/
const SignalPuzzle = dynamic(
  () => import("@portfolio/ui/components/signal-puzzle").then((m) => m.SignalPuzzle),
  { ssr: false },
);
import {
  SystemScreen,
  useTypedLog,
  type SystemLine,
} from "@/components/system/system-screen";

/** How often to re-test the network when no `online` event has arrived. */
const POLL_MS = 5000;

/** Decorative — see the header. */
function terminalLines(host: string): readonly SystemLine[] {
  return [
    { text: `$ ping -c 3 ${host}`, tone: "prompt" },
    { text: "Request timeout for icmp_seq 0", tone: "muted" },
    { text: "Request timeout for icmp_seq 1", tone: "muted" },
    { text: "Request timeout for icmp_seq 2", tone: "muted" },
    { text: `--- ${host} ping statistics ---`, tone: "muted" },
    { text: "3 packets transmitted, 0 received, 100.0% packet loss", tone: "alert" },
    { text: "[STATUS] Connection lost. Link status: DISCONNECTED", tone: "alert" },
    { text: "[INFO] Monitoring network interfaces for link signal...", tone: "muted" },
  ];
}

/*
  The hostname the terminal prints.

  It never changes for the life of the document, so `subscribe` has nothing to
  listen to and `getSnapshot` returns the same string every call — which is
  what `useSyncExternalStore` requires to avoid re-rendering forever. Reading
  it with a `setState` in an effect renders the component twice and is what
  React's own lint rule warns about.
*/
function readHost(): string {
  return window.location.hostname;
}

/** No `location` on the server, and nothing worth guessing. */
function serverHost(): string {
  return "this site";
}

function subscribeHost(): () => void {
  return () => {};
}

export function OfflineScreen({
  /**
   * What to do once the network is genuinely back.
   *
   * The route reloads, because the page the visitor wanted was never fetched.
   * The overlay dismisses itself, because the page behind it is still there
   * and reloading would throw away whatever they had scrolled to or typed.
   */
  onReconnect,
  /**
   * Whether a request is already known to have failed.
   *
   * True for the overlay, which only mounts because the browser fired
   * `offline`. False for the route, which may equally have been opened by
   * someone who is perfectly online and curious — and who must not be thrown
   * somewhere else for it.
   */
  hasFailed = false,
}: {
  onReconnect: () => void;
  hasFailed?: boolean;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const reconnected = useRef(false);
  /** Set the first time a probe fails. Nothing recovers before that. */
  const sawFailure = useRef(hasFailed);

  const host = useSyncExternalStore(subscribeHost, readHost, serverHost);
  const lines = terminalLines(host);
  const revealed = useTypedLog(lines.length);

  /**
   * Is anything actually reachable?
   *
   * `navigator.onLine` is famously optimistic — it reports the state of the
   * network interface, so a laptop attached to a router with no uplink is
   * "online". The only honest test is a request that has to succeed.
   */
  const probe = useCallback(async (): Promise<boolean> => {
    try {
      await fetch("/favicon.ico", {
        method: "HEAD",
        cache: "no-store",
        // Same-origin and tiny. `no-store` because a cached 200 would answer
        // this question with an answer from before the connection dropped.
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const check = useCallback(async () => {
    if (reconnected.current) return;
    setIsChecking(true);
    const alive = await probe();
    setIsChecking(false);

    if (!alive) {
      sawFailure.current = true;
      return;
    }
    // Reachable — but "recovered" only means something after a failure. On the
    // route this is the ordinary case of someone opening the URL while online.
    if (!sawFailure.current) return;

    reconnected.current = true;
    onReconnect();
  }, [onReconnect, probe]);

  useEffect(() => {
    const onOnline = () => void check();
    window.addEventListener("online", onOnline);
    // Polling as well as listening: `online` never fires for a captive portal
    // that starts answering, or for a link that was flapping when the page
    // loaded. Five seconds is slow enough to cost nothing and fast enough that
    // nobody reaches for the reload button first.
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [check]);

  return (
    <SystemScreen
      screen="offline"
      mascot="signal"
      status="No connection"
      headlinePrefix="You&rsquo;re"
      headline="offline"
      typedLine="Can&rsquo;t reach this site right now."
      terminalTitle="network_status.sh"
      lines={lines}
      revealed={revealed}
      footer={
        <div className="mt-2 flex w-full flex-col items-center gap-5">
          <SignalPuzzle />
          <p className="font-mono text-xs text-fg-muted">
            {isChecking ? "Checking for a connection…" : "Watching for the network…"}
          </p>
        </div>
      }
    >
      It comes back on its own the moment the network does — nothing to press.
    </SystemScreen>
  );
}
