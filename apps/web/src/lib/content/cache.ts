/**
 * A short-lived, in-isolate cache for content reads.
 *
 * ## Why not `revalidate`
 *
 * Next's ISR is the obvious answer and is not available here: OpenNext's
 * incremental cache needs a Cloudflare binding this project does not have, and
 * creating one is a human action (see `open-next.config.ts` and
 * `docs/DEPLOYMENT.md`). This needs no binding, no bucket, and no
 * configuration — which is the entire reason it is a memo and not ISR.
 *
 * ## What it actually saves
 *
 * Every route in this app is dynamic, so before this each page view ran the
 * full content read against D1 — roughly a dozen queries for a page whose
 * content changes when the owner edits it, which is not often. A Worker
 * isolate serves many requests before it is recycled, so one read now covers
 * all of them within the window.
 *
 * ## What it costs, stated plainly
 *
 * An edit in the CMS can take up to `TTL_MS` to appear on the public site, and
 * longer in practice: the cache is **per isolate**, and Cloudflare runs many.
 * A visitor hitting a cold isolate sees the new content immediately while
 * another still sees the old, for up to a minute. That is acceptable for a
 * portfolio and would not be for a checkout page.
 *
 * Disabled outright in development, where waiting a minute to see your own
 * edit is the wrong trade.
 *
 * ## Only for content everyone shares
 *
 * Nothing request-specific may go through this. The cached values are the same
 * published content for every visitor, so there is nothing here that could
 * leak from one request into another — the property that makes cross-request
 * state safe, and the one to check before adding a key.
 */

/** Long enough to be worth having, short enough that an edit is not "lost". */
const TTL_MS = 60_000;

interface Entry {
  readonly expiresAt: number;
  /** The in-flight or settled read. */
  readonly value: Promise<unknown>;
}

const entries = new Map<string, Entry>();

export function cachedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  // `next dev` recompiles on every change; a stale minute there is just
  // confusing.
  if (process.env.NODE_ENV !== "production") return read();

  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) return existing.value as Promise<T>;

  // The promise is stored, not the resolved value, so concurrent requests
  // arriving during the read share it instead of each starting their own —
  // the stampede that makes a cold cache briefly worse than no cache.
  const value = read().catch((error: unknown) => {
    // A failed read must not be cached for a minute: the next request should
    // try again, not be told the same lie until the entry expires.
    entries.delete(key);
    throw error;
  });

  entries.set(key, { expiresAt: now + TTL_MS, value });
  return value;
}
