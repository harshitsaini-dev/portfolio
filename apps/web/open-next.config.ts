import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter configuration for the public site.
 *
 * Deliberately empty of overrides, and that is a decision rather than a
 * placeholder.
 *
 * ## Why no cache, queue, or tag-cache override
 *
 * `defineCloudflareConfig()` defaults `incrementalCache`, `tagCache`, `queue`
 * and `cachePurge` to `"dummy"`, which needs no binding and no Cloudflare
 * resource. That is the correct choice here because **every route in this app
 * is dynamic** — `next build` reports `ƒ (Dynamic) server-rendered on demand`
 * for `/`, `/media/[id]` and `/projects/[slug]`, since all of them read D1 per
 * request. There is no ISR and no static revalidation, so there is nothing for
 * an incremental cache to hold.
 *
 * Configuring one anyway would mean creating a second R2 bucket purely to
 * cache pages that are never cached, and this slice creates no Cloudflare
 * resources.
 *
 * The official template also wires `WORKER_SELF_REFERENCE` (for revalidation
 * dispatch) and an `IMAGES` binding (for `next/image`). Neither applies: there
 * is no revalidation to dispatch, and `ContentImage` renders a plain `<img>`
 * on purpose — see the note in that component about routing R2 bytes back
 * through the optimizer inside the same Worker.
 *
 * When caching or image optimization is genuinely wanted, this is the file
 * that gains the override, and it will need the matching bindings in
 * `wrangler.jsonc` at the same time.
 */
export default defineCloudflareConfig();
