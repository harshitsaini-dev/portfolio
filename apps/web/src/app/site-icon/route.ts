import { redirect } from "next/navigation";

import { getSiteContent } from "@/lib/content/site-content";

/**
 * A stable URL for the icon the CMS currently holds.
 *
 * Served at `/site-icon`, NOT `/favicon`. The obvious name collides with
 * Next's `favicon.ico` metadata file convention: a route at that segment
 * built and deployed without complaint and then answered 404 in production —
 * measured against the deployed Worker, while the media asset it should have
 * redirected to returned 200 on its own URL.
 *
 * The favicon itself lives at `/media/[id]`, and that id changes whenever the
 * editor uploads a new one. Anything that wants to *reference* the icon rather
 * than re-read it — the admin app's own tab icon, in the first instance —
 * needs an address that does not change when the image does. This is it.
 *
 * ## Why a redirect rather than serving the bytes
 *
 * `/media/[id]` already resolves the asset, re-checks its content type against
 * the allowlist and sets a year-long immutable cache header. Duplicating that
 * here would be a second copy of the delivery rules to keep in step with the
 * first. The redirect is not cached, which is what makes the URL stable, and
 * the image it points to is — so a browser that has already fetched the icon
 * pays for one small 307 and no bytes.
 *
 * ## Why this is public
 *
 * A favicon is requested by the browser chrome, often on a connection that
 * carries no application cookies, so an icon behind an authentication gate is
 * an icon that never loads. This route exposes nothing that
 * `<link rel="icon">` in the public HTML does not already say out loud.
 *
 * 404 when no icon is configured, rather than falling back to the bundled
 * `favicon.ico`: the caller asked for the CMS icon specifically, and an
 * answer of "there isn't one" is more useful than a different image.
 */
export async function GET(): Promise<Response> {
  const content = await getSiteContent();
  const favicon = content.theme.favicon;

  if (!favicon) {
    return new Response("No favicon configured", { status: 404 });
  }

  redirect(favicon.href);
}
