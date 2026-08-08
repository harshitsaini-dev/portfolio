/**
 * Serves the bytes of a media asset to the public.
 *
 * The public counterpart of the admin's `/media/[id]/raw`, and deliberately
 * not the same handler: the two differ in exactly the ways that matter.
 *
 *   * **No authorization.** These images are published content — a logo on a
 *     skill, a project cover, the site owner's photograph. Requiring a
 *     session to load them would break the page for every visitor.
 *   * **`public` caching, not `private`.** The admin's responses are for one
 *     authenticated administrator and must not enter a shared cache. These
 *     are meant to.
 *
 * What is identical is the part that protects the visitor: the content type
 * comes from the database row — what the upload policy sniffed from the
 * leading bytes, never the request — is re-checked against the allowed list,
 * and is sent with `nosniff` so a browser cannot decide to execute the
 * response as something else. The allowed list contains no SVG for exactly
 * that reason.
 *
 * ## Every asset is reachable, and that is intended
 *
 * This route serves any row in `media_assets`, not only images an editor has
 * attached to something. That is a real property worth stating rather than
 * discovering later: the media library is a library of *published* files.
 * Nothing private is stored there — uploads exist to be shown — and a scheme
 * where reachability depended on being referenced would break the moment an
 * editor detached an image while a page still linked to it.
 *
 * Ids are UUIDv7, so they are not guessable in practice, but that is not the
 * protection being relied on. If genuinely private files are ever needed,
 * they need a separate namespace and a separate rule, not a filter here.
 */

import { isMediaContentType } from "@portfolio/schemas";

import { getSiteRepositories } from "@/lib/db/binding";
import { getSiteStorage } from "@/lib/storage/binding";

/**
 * The bytes behind an id never change: a storage key is generated per upload
 * and an edit replaces the row rather than the object. So the response is
 * immutable, and `public` so a CDN or browser cache can serve it without
 * asking again.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  let asset;
  try {
    const repos = await getSiteRepositories();
    asset = await repos.media.getById(id);
  } catch (error) {
    // The seams fail closed, and their messages describe the deployment
    // shape. That belongs in the server log and nowhere near a visitor.
    console.error("[web] media lookup failed", error);
    return new Response("Unavailable", { status: 500 });
  }

  if (!asset) return new Response("Not found", { status: 404 });

  // Defence in depth against a row written by a looser policy than today's.
  if (!isMediaContentType(asset.contentType)) {
    console.error("[web] refusing to serve disallowed content type", {
      id: asset.id,
    });
    return new Response("Unsupported media type", { status: 415 });
  }

  let bytes: ArrayBuffer;
  try {
    const storage = await getSiteStorage();
    const object = await storage.get(asset.storageKey);
    if (!object) {
      // The row outlived its object. The media service orders its writes to
      // make this unreachable, so reaching it is worth a log rather than a
      // silent 404.
      console.error("[web] media row has no object in storage", { id: asset.id });
      return new Response("Not found", { status: 404 });
    }
    bytes = await object.arrayBuffer();
  } catch (error) {
    console.error("[web] media fetch failed", error);
    return new Response("Unavailable", { status: 500 });
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(bytes.byteLength),
      // No filename: the schema stores none, and inventing one would put an
      // influenced string into a header that controls how a browser saves.
      "Content-Disposition": "inline",
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
