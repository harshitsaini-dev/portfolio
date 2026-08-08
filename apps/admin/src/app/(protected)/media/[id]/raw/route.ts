/**
 * Serves the bytes of a stored media asset to an authenticated admin.
 *
 * Until this route existed there was **no way to see an uploaded file at
 * all**: the media list showed names and sizes, the detail page showed
 * metadata, and nothing could render a thumbnail. An icon picker that cannot
 * show the icon is not a picker, so this is the prerequisite for the whole
 * icon feature.
 *
 * ## Order of operations, and why it is this order
 *
 *   1. `requireAdminIdentity()` **first**, before the id is read and before
 *      any binding is resolved. A route handler is a public endpoint; the
 *      `(protected)` segment is a routing convention, not an authorization
 *      mechanism, and a layout cannot stop a handler from running.
 *   2. Look the asset up in D1. The row is the authority for the object's
 *      key and content type — the request supplies an id and nothing else,
 *      so no caller-controlled string reaches the bucket.
 *   3. Fetch the object through the storage seam.
 *
 * ## Serving bytes somebody uploaded
 *
 * The content type comes from the **database row**, which recorded what the
 * upload policy sniffed from the leading bytes — never from the request, and
 * never from the object's own metadata. It is re-checked against the allowed
 * list here rather than trusted: the row was written by today's policy, and a
 * row written by an older or looser one must not widen what this route will
 * emit. A type that is no longer allowed is refused, not passed through.
 *
 * `X-Content-Type-Options: nosniff` then stops a browser from disagreeing
 * with that declared type and executing the response as something else. The
 * allowed list contains no SVG for exactly this reason — an SVG is a script
 * host, and one served from the admin's own origin would run there.
 *
 * `Content-Disposition: inline` carries **no filename**. The schema stores no
 * original filename by design, and inventing one here would put an
 * attacker-influenced string into a header that controls how a browser saves
 * the file.
 */

import { isMediaContentType } from "@portfolio/schemas";

import { requireAdminIdentity } from "@/lib/auth/guard";
import { getAdminRepositories } from "@/lib/db/binding";
import { getAdminStorage } from "@/lib/storage/binding";

/**
 * The bytes behind an id never change: a storage key is generated per upload
 * and an edit replaces the row rather than the object. So the response is
 * immutable — but `private`, because it is only ever served to one
 * authenticated administrator and must not be held by a shared cache.
 */
const CACHE_CONTROL = "private, max-age=31536000, immutable";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Authorization before anything else touches a binding or the id.
  await requireAdminIdentity();

  const { id } = await context.params;

  const repos = await getAdminRepositories();
  const asset = await repos.media.getById(id);
  // 404 rather than 403: an authenticated admin may see every asset, so a
  // miss means the row is gone, not that access was denied.
  if (!asset) return new Response("Not found", { status: 404 });

  // Defence in depth against a row written by a looser policy than today's.
  if (!isMediaContentType(asset.contentType)) {
    console.error(
      "[admin] refusing to serve media asset with disallowed content type",
      { id: asset.id },
    );
    return new Response("Unsupported media type", { status: 415 });
  }

  const storage = await getAdminStorage();
  const object = await storage.get(asset.storageKey);
  // The row outlived its object. The media service orders its writes to make
  // this unreachable, and reports it when a compensating delete fails, so
  // reaching it here is worth a server-side log rather than a silent 404.
  if (!object) {
    console.error("[admin] media row has no object in storage", { id: asset.id });
    return new Response("Not found", { status: 404 });
  }

  const bytes = await object.arrayBuffer();

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
