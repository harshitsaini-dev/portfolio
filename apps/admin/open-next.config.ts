import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter configuration for the admin.
 *
 * Empty of overrides for the same measured reason as the web app's config
 * (see `apps/web/open-next.config.ts`): every route in this app is dynamic —
 * `next build` reports `ƒ (Dynamic)` for all of them, since everything reads
 * D1 per request behind authorization — so the `"dummy"` defaults for
 * incremental cache, tag cache and queue are correct and need no extra
 * binding or bucket.
 *
 * For the admin there is an additional reason to keep it this way: a CMS is
 * the one place where a stale cache is actively harmful. An editor who saves
 * and still sees the old value will save again. No cache is a feature here,
 * not a shortcut.
 */
export default defineCloudflareConfig();
