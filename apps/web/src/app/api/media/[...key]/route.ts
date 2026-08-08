import { getPublicRepositories } from "../../../../lib/db/binding.ts";
import { getPublicStorage, PublicStorageUnavailableError } from "../../../../lib/storage/binding.ts";

export async function GET(
  _request: Request,
  props: { params: Promise<{ key?: string[] }> },
) {
  const params = await props.params;
  const keySegments = params.key ?? [];
  const storageKey = keySegments.join("/");

  if (!storageKey || storageKey.startsWith("resumes/") || !storageKey.startsWith("media/")) {
    return Response.json(
      { error: "Forbidden: Direct key access to restricted namespace is denied" },
      { status: 403 },
    );
  }

  try {
    const repos = await getPublicRepositories();
    const mediaAsset = await repos.media.getByStorageKey(storageKey);
    if (!mediaAsset) {
      return Response.json({ error: "Media asset metadata not found" }, { status: 404 });
    }

    const storage = await getPublicStorage();
    const object = await storage.get(storageKey);

    if (!object) {
      return Response.json({ error: "Media asset file not found in storage" }, { status: 404 });
    }

    const bytes = await object.arrayBuffer();

    const headers = new Headers();
    headers.set("Content-Type", mediaAsset.contentType);
    headers.set("Content-Length", String(mediaAsset.byteSize));
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(bytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof PublicStorageUnavailableError) {
      return Response.json(
        { error: "Storage service unavailable" },
        { status: 503 },
      );
    }
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
