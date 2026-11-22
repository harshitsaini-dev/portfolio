/**
 * `/media` — mirrors `lib/actions/media.ts`.
 *
 * Uploads and deletions go through the same `MediaService` the admin uses, so
 * the same upload policy applies byte for byte: content type sniffed from the
 * bytes (never trusted from the client), per-type size ceilings, alt text
 * required on images, collision-free storage keys, compensation when the
 * metadata write fails, and the in-use check before a delete. The service is
 * built here from the request's repositories and the storage seam
 * (`lib/storage/binding.ts`) — the bucket is never reached directly.
 *
 * ## What the admin does that this does not
 *
 * The admin downscales large images to WebP **in the browser** before upload
 * (`lib/media/optimise.ts`); a Worker has no image codec. An API client
 * uploads exactly the bytes it sends, so it should resize first.
 *
 * ## `downloadUrl`
 *
 * Every media response carries `downloadUrl`: where the public site serves
 * the bytes (`<site>/media/<id>`), derived exactly as the backup route does.
 * Null when the site origin is not configured — an honest absence rather than
 * a guessed URL that 404s.
 */

import {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_UPLOAD_BYTES,
  MEDIA_CONTENT_TYPES,
  mediaAssetUpdateSchema,
  mediaPurposeSchema,
} from "@portfolio/schemas";
import { uuidV7 } from "@portfolio/database";
import type { MediaAsset } from "@portfolio/types";

import { ApiError, defineRoute, listOf, notFound, ref, type ApiContext, type ApiRoute, type JsonSchema } from "../define.ts";
import { createMediaService, type MediaFailure, type MediaService } from "../../media/service.ts";
import { getPublicSiteOrigin } from "../../site-origin.ts";
import { getAdminStorage, StorageUnavailableError } from "../../storage/binding.ts";
import { entity, META, primitives } from "./schemas.ts";

const TAG = "Media";

const { str, nstr, int, nint } = primitives;

export const mediaSchemas: Record<string, JsonSchema> = {
  MediaAsset: entity("An uploaded file (image or PDF) in the media library.", {
    ...META,
    storageKey: { ...str, description: "Server-side object key. Informational; use `downloadUrl` to fetch the bytes." },
    contentType: { type: "string", enum: [...MEDIA_CONTENT_TYPES] },
    byteSize: int,
    width: nint,
    height: nint,
    checksum: nstr,
    altText: { ...nstr, description: "Required (non-null) for images." },
    downloadUrl: {
      ...nstr,
      description: "Public URL of the bytes on the portfolio site, or null when the site origin is not configured.",
    },
  }),
};

export function withDownloadUrl(asset: MediaAsset): MediaAsset & { downloadUrl: string | null } {
  const origin = getPublicSiteOrigin();
  return {
    ...asset,
    downloadUrl: origin ? `${origin}/media/${encodeURIComponent(asset.id)}` : null,
  };
}

/** The admin's media service, over this request's repositories. */
async function mediaService({ repos }: ApiContext): Promise<MediaService> {
  let storage;
  try {
    storage = await getAdminStorage();
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      console.error("[api] media storage unavailable", error);
      throw new ApiError(503, "storage_unavailable", "File storage is not available right now.");
    }
    throw error;
  }
  return createMediaService({
    storage,
    media: repos.media,
    projects: repos.projects,
    resumes: repos.resumes,
    siteSettings: repos.siteSettings,
    newId: uuidV7,
    onDiagnostic(event) {
      console.error(
        `[api] media ${event.kind} — object left at ${event.storageKey}; reconciliation required`,
        event.cause,
      );
    },
  });
}

/** A service failure → the response the admin's action maps it to. */
function toApiError(failure: MediaFailure, field = "file"): ApiError {
  switch (failure.reason) {
    case "validation":
      return new ApiError(422, "validation_failed", failure.message, { [field]: [failure.message] });
    case "not_found":
      return new ApiError(404, "not_found", failure.message);
    case "in_use":
      return new ApiError(409, "in_use", failure.message);
    default:
      return new ApiError(500, "internal_error", failure.message);
  }
}

function invalid(fields: Record<string, string[]>): ApiError {
  return new ApiError(422, "validation_failed", "Some fields are invalid.", fields);
}

/** Read a multipart body, refusing anything else and anything oversize. */
export async function readMultipart(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\b/i.test(type)) {
    throw new ApiError(415, "unsupported_media_type", "Send the upload as multipart/form-data.");
  }
  // A little headroom over the largest file for the multipart framing and the
  // text fields. The file itself is checked against its exact ceiling below.
  const ceiling = MAX_UPLOAD_BYTES + 64 * 1024;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > ceiling) {
    throw new ApiError(413, "payload_too_large", `Files may be at most ${MAX_UPLOAD_BYTES} bytes.`);
  }
  try {
    return await request.formData();
  } catch {
    throw new ApiError(400, "bad_request", "The multipart body could not be read.");
  }
}

export const mediaRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/media",
    tag: TAG,
    operationId: "listMedia",
    summary: "List media",
    description: "Every uploaded file. Use an asset's `id` wherever a field ends in `MediaId` (e.g. a project's `coverMediaId`).",
    scope: "read",
    returns: "Media assets.",
    response: listOf(ref("MediaAsset")),
    async handler({ repos }) {
      return (await repos.media.list()).map(withDownloadUrl);
    },
  }),

  defineRoute({
    method: "GET",
    path: "/media/{id}",
    tag: TAG,
    operationId: "getMedia",
    summary: "Get a media asset",
    scope: "read",
    returns: "The media asset.",
    response: ref("MediaAsset"),
    async handler({ repos }, { id }) {
      const asset = await repos.media.getById(id!);
      if (!asset) throw notFound("Media asset");
      return withDownloadUrl(asset);
    },
  }),

  defineRoute({
    method: "POST",
    path: "/media",
    tag: TAG,
    operationId: "uploadMedia",
    summary: "Upload a file",
    description: [
      "Upload one image or PDF as `multipart/form-data`.",
      "",
      `- Accepted: ${MEDIA_CONTENT_TYPES.join(", ")}. The type is detected from the file's bytes; a declared type that disagrees is rejected.`,
      `- Size: images up to ${MAX_IMAGE_BYTES} bytes, PDFs up to ${MAX_PDF_BYTES} bytes.`,
      "- `altText` is **required for images** (it is what a screen reader says).",
      "- Not resized on the server — the admin shrinks images in the browser before upload; an API client should resize large images itself.",
      "",
      "Typical flow: upload → take `data.id` → `PATCH /projects/{id}` with `{\"coverMediaId\": \"<id>\"}` (or `iconMediaId`, or add it to `media`). For a résumé, upload the PDF here and then `POST /resumes` with its id.",
      "",
      "Example: `curl -H \"Authorization: Bearer $KEY\" -F file=@cover.webp -F altText=\"Dashboard screenshot\" $BASE/media`",
    ].join("\n"),
    scope: "write",
    multipart: {
      fields: {
        file: { type: "file", required: true, description: "The file. PNG, JPEG, WebP or PDF." },
        altText: { type: "string", required: false, description: "Description of the image. Required for images, max 300 characters." },
        purpose: { type: "string", required: false, description: "`media` (default) or `resumes` — the storage namespace." },
      },
    },
    returns: "The created media asset.",
    response: ref("MediaAsset"),
    async handler(context) {
      const form = await readMultipart(context.request);

      const purpose = mediaPurposeSchema.safeParse(form.get("purpose") ?? "media");
      if (!purpose.success) throw invalid({ purpose: ["Use `media` or `resumes`."] });

      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        throw invalid({ file: ["Attach a file in the `file` field."] });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiError(413, "payload_too_large", `Files may be at most ${MAX_UPLOAD_BYTES} bytes.`);
      }

      const altTextRaw = form.get("altText");
      if (altTextRaw !== null && typeof altTextRaw !== "string") {
        throw invalid({ altText: ["Send alt text as a text field."] });
      }
      if (typeof altTextRaw === "string" && altTextRaw.trim().length > 300) {
        throw invalid({ altText: ["Too long"] });
      }

      const service = await mediaService(context);
      const result = await service.createAsset({
        purpose: purpose.data,
        declaredContentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        altText: altTextRaw,
      });
      if (!result.ok) {
        // The service's alt-text refusal is about `altText`, not the file.
        throw toApiError(result, result.message.startsWith("Images need alt text") ? "altText" : "file");
      }
      return withDownloadUrl(result.data);
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/media/{id}",
    tag: TAG,
    operationId: "updateMedia",
    summary: "Update a media asset's alt text",
    description: "Only `altText` is editable; the file itself is immutable — upload a new one instead. An image's alt text cannot be cleared.",
    scope: "write",
    body: mediaAssetUpdateSchema,
    returns: "The updated media asset.",
    response: ref("MediaAsset"),
    async handler({ repos }, { id }, input) {
      const existing = await repos.media.getById(id!);
      if (!existing) throw notFound("Media asset");
      // An omitted key leaves the asset as it is.
      if (input.altText === undefined) return withDownloadUrl(existing);

      const nextAltText = input.altText ?? null;
      if (existing.contentType.startsWith("image/") && nextAltText === null) {
        throw invalid({
          altText: ["Images need alt text describing them for people using a screen reader."],
        });
      }
      return withDownloadUrl(await repos.media.update(id!, { altText: nextAltText }));
    },
  }),

  defineRoute({
    method: "DELETE",
    path: "/media/{id}",
    tag: TAG,
    operationId: "deleteMedia",
    summary: "Delete a media asset",
    description:
      "Removes the record and the stored file. Refused with 409 `in_use` while anything still uses it (a project's icon/cover/gallery, a résumé, a site setting) — detach it there first.",
    scope: "write",
    returns: "Nothing.",
    async handler(context, { id }) {
      const service = await mediaService(context);
      const result = await service.deleteAsset(id!);
      if (!result.ok) throw toApiError(result);
      if (!result.data.objectRemoved) {
        // Same contract as the admin: the record is gone, so the delete is
        // done from the caller's point of view; the leftover is logged.
        console.error(`[api] media ${id} deleted but its stored object was not removed; reconciliation required`);
      }
      return null;
    },
  }),
];
