import { getPublicRepositories } from "../../lib/db/binding.ts";
import { getPublicStorage, PublicStorageUnavailableError } from "../../lib/storage/binding.ts";

export async function GET() {
  try {
    const repos = await getPublicRepositories();
    const currentResume = await repos.resumes.getCurrent();

    if (!currentResume || !currentResume.isVisible) {
      return Response.json(
        { error: "No active résumé available" },
        { status: 404 },
      );
    }

    const mediaAsset = await repos.media.getById(currentResume.mediaAssetId);
    if (!mediaAsset) {
      return Response.json(
        { error: "Active résumé asset metadata missing" },
        { status: 404 },
      );
    }

    const storage = await getPublicStorage();
    const object = await storage.get(mediaAsset.storageKey);

    if (!object) {
      return Response.json(
        { error: "Active résumé file not found in storage" },
        { status: 404 },
      );
    }

    const bytes = await object.arrayBuffer();

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(mediaAsset.byteSize));
    headers.set("Content-Disposition", 'inline; filename="resume.pdf"');
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

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
