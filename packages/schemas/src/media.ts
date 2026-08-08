/**
 * Upload policy and storage-key grammar.
 *
 * The **untrusted-binary** boundary, and a sibling of the untrusted-text
 * boundaries in this package rather than a different kind of thing: a caller
 * hands over bytes and some claims about them, and nothing here believes the
 * claims.
 *
 * Everything in this module is **pure**. No storage, no database, no clock,
 * no randomness — the one value that must be unique is injected. That is what
 * makes the policy testable without a bucket, and it is why this file can
 * live beside `internal/url.ts` and `internal/slug.ts` instead of inside the
 * admin app.
 *
 * ## What is deliberately not trusted
 *
 * The browser's `accept` attribute, the filename, the filename extension, the
 * client-declared MIME type, and any client-reported size or dimensions are
 * **hints with no authority**. The declared type is checked against the
 * allowlist *and* against what the bytes actually are, and a disagreement is
 * rejected rather than quietly resolved in the sniff's favour — a mismatch
 * means a broken client or a probe, and neither should be silently corrected.
 *
 * See `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` for the reasoning.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Supported formats
// ---------------------------------------------------------------------------

/**
 * The canonical MIME strings this application accepts, and the only ones a
 * `media_assets.content_type` may hold.
 *
 * Derived from what the committed schema can actually be used for: project
 * images and the social share image (raster), and résumés (PDF). It is not
 * broadened speculatively — every added format is an added parser, an added
 * delivery consideration, and an added way to be wrong.
 *
 * **SVG is excluded, on evidence rather than reflex.** An SVG is an
 * active-content document, not an image: it can carry `<script>`, event
 * handlers, external references, and CSS, all of which execute if it is ever
 * inlined or served from the site's own origin. The migration `0001` audit
 * looked for a requirement before ruling on the risk and found none — no
 * committed table attaches a logo or icon to a tool, technology, or skill, so
 * enabling SVG would mean adding a sanitizer dependency and that attack
 * surface to serve a need that does not exist. **No approved sanitizer exists
 * in this project, and none is being added.** If logos are wanted later they
 * will need a migration to attach media to those tables anyway, and the safe
 * delivery strategy can be designed then, against a real requirement.
 *
 * GIF, AVIF, video, archives, office documents, and arbitrary binaries are
 * excluded on the same "no requirement yet" basis.
 */
export const IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const DOCUMENT_CONTENT_TYPES = ["application/pdf"] as const;

export const MEDIA_CONTENT_TYPES = [
  ...IMAGE_CONTENT_TYPES,
  ...DOCUMENT_CONTENT_TYPES,
] as const;

export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number];

export function isMediaContentType(value: string): value is MediaContentType {
  return (MEDIA_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isImageContentType(value: string): value is ImageContentType {
  return (IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * The canonical extension for each accepted type, without the dot.
 *
 * **JPEG is `jpg`, not `jpeg`** — one spelling, chosen arbitrarily but fixed,
 * because two spellings for one format would mean two keys can describe the
 * same object and any future reconciliation has to normalise before it can
 * compare. The extension never comes from the uploaded filename, so the
 * user's own spelling never reaches a key and there is no ambiguity to
 * preserve.
 *
 * The extension is cosmetic: it makes a bucket listing readable during
 * debugging. Authority over an object's type is `media_assets.content_type`,
 * which is validated, plus the `httpMetadata` recorded on the object itself.
 */
export const CANONICAL_EXTENSIONS: Readonly<Record<MediaContentType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// ---------------------------------------------------------------------------
// Size policy
// ---------------------------------------------------------------------------

/**
 * Byte ceilings, as documented in the Phase 9 audit.
 *
 * Written as explicit multiplications so the number is unambiguous: these are
 * binary megabytes, and `5 * 1024 * 1024` cannot be misread the way
 * `5_000_000` can. Both are **application-level editorial bounds chosen by
 * us** — a portfolio screenshot larger than 5 MB is an unoptimised export,
 * and a résumé larger than 10 MB is not a résumé. **No Cloudflare platform
 * limit is being asserted or implied**; the Workers request-body ceiling is
 * far above both and is not what these numbers encode.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** The largest upload any accepted type permits. */
export const MAX_UPLOAD_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_PDF_BYTES);

/** The ceiling that applies to a given accepted type. */
export function maxBytesFor(contentType: MediaContentType): number {
  return contentType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

// ---------------------------------------------------------------------------
// Byte-signature detection
// ---------------------------------------------------------------------------

/**
 * How many leading bytes the sniffer reads.
 *
 * Bounded on purpose: detection must never depend on the size of the input,
 * so a caller can read a fixed head off a stream and decide before buffering
 * the rest. Twelve bytes is the longest prefix any signature below needs
 * (WebP's `RIFF....WEBP`); sixteen leaves a little room without inviting
 * "just read a bit more".
 */
export const SNIFF_BYTE_LENGTH = 16;

/** `\x89PNG\r\n\x1a\n` — the full 8-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * JPEG: SOI (`FF D8`) immediately followed by the first marker's `FF`.
 *
 * Checking three bytes rather than two matters. `FF D8` alone appears at the
 * start of plenty of unrelated binary data, whereas a real JPEG always
 * continues into a marker segment, so the third `FF` is what makes this a
 * signature rather than a coincidence. The marker *type* after it varies
 * legitimately (`E0` JFIF, `E1` Exif, `DB`, `EE`, and others), so it is
 * deliberately not pinned — doing so would reject valid files.
 */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** `RIFF` at offset 0 and `WEBP` at offset 8; the 4 bytes between are a length. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

/** `%PDF-` at offset 0. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

function matchesAt(
  bytes: Uint8Array,
  signature: readonly number[],
  offset: number,
): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Identify an accepted format from its leading bytes.
 *
 * Returns `null` for anything not on the allowlist — including formats that
 * are perfectly valid but unsupported. This is an allowlist, so "unknown" and
 * "known but not permitted" collapse into the same answer on purpose: the
 * caller must not be able to branch on *why* a file was refused in a way that
 * turns into "well, allow that one too".
 *
 * Only the first `SNIFF_BYTE_LENGTH` bytes are examined; passing more is
 * harmless and passing fewer than a signature needs simply fails to match.
 */
export function detectContentType(bytes: Uint8Array): MediaContentType | null {
  const head = bytes.length > SNIFF_BYTE_LENGTH
    ? bytes.subarray(0, SNIFF_BYTE_LENGTH)
    : bytes;

  if (matchesAt(head, PNG_SIGNATURE, 0)) return "image/png";
  if (matchesAt(head, JPEG_SIGNATURE, 0)) return "image/jpeg";
  if (matchesAt(head, RIFF_SIGNATURE, 0) && matchesAt(head, WEBP_SIGNATURE, 8)) {
    return "image/webp";
  }
  if (matchesAt(head, PDF_SIGNATURE, 0)) return "application/pdf";
  return null;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/**
 * Key prefixes, which are also the public/restricted classification.
 *
 * `media_assets` has no privacy column and one is not being invented, so the
 * prefix carries it — the only classification available without a migration.
 *
 * - `media` — portfolio images. Publicly addressable **by key** through the
 *   delivery route, and cacheable.
 * - `resumes` — résumé files. **Never addressable by key.** The public site
 *   serves the current, visible résumé from a stable path resolved through
 *   `resumes.is_current` and `is_visible`, so un-publishing one actually
 *   stops serving it instead of leaving a URL that works forever.
 */
export const STORAGE_NAMESPACES = ["media", "resumes"] as const;
export type StorageNamespace = (typeof STORAGE_NAMESPACES)[number];

/**
 * A generated key: one namespace segment, one id, one canonical extension.
 *
 * The id is matched as lowercase hexadecimal and hyphens rather than as a
 * strict UUID, so the grammar does not have to change if the id generator
 * ever does. What the pattern *does* guarantee is the part that matters: no
 * `..`, no backslash, no leading slash, no second directory level, and no
 * character that has ever needed escaping in a URL path.
 */
export const STORAGE_KEY_PATTERN =
  /^(?:media|resumes)\/[0-9a-f-]{1,64}\.(?:png|jpg|webp|pdf)$/;

export interface StorageKeyInput {
  readonly namespace: StorageNamespace;
  readonly contentType: MediaContentType;
  /**
   * A fresh unique identifier, supplied by the caller.
   *
   * Injected rather than generated here so this module stays pure and this
   * package keeps its two dependencies. The admin composition passes
   * `uuidV7` from `@portfolio/database` — the same generator that produces
   * row ids — which is time-ordered, collision-resistant, and already the
   * project's answer to "where do identifiers come from".
   */
  readonly id: string;
}

/**
 * Build the object key for a new upload.
 *
 * **No byte of user input reaches the result.** The namespace is one of two
 * literals, the extension is derived from the *sniffed* content type, and the
 * id is server-generated — so path traversal is structurally impossible
 * rather than filtered out, and there is no filename to sanitise. That is the
 * whole point: a sanitiser is a blocklist that has to anticipate traversal
 * sequences, control characters, null bytes, reserved device names, Unicode
 * normalisation collisions, and case-insensitive clashes, and it stays wrong
 * until the last one is found.
 *
 * Throws if the supplied id could not produce a safe key. That is a
 * programming error, not user input — the id comes from our own generator —
 * so it fails loudly rather than returning a result the caller might ignore.
 */
export function buildStorageKey(input: StorageKeyInput): string {
  const extension = CANONICAL_EXTENSIONS[input.contentType];
  const key = `${input.namespace}/${input.id}.${extension}`;
  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw new Error("storage key generation produced an unsafe key");
  }
  return key;
}

/** Whether a key was produced by `buildStorageKey`'s grammar. */
export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key);
}

// ---------------------------------------------------------------------------
// The upload decision
// ---------------------------------------------------------------------------

/**
 * The declared envelope accompanying an upload.
 *
 * Validated with Zod because it is ordinary untrusted structured input, the
 * same as any form payload. `.strict()` for the same reason every other
 * schema here is: an unexpected key is a client bug or a probe, and silently
 * dropping it hides both.
 *
 * `byteSize` is the client's claim and is checked against the real byte
 * length before anything is stored. It is accepted at all so an oversized
 * upload can be refused from the declaration alone, before its body is read.
 */
export const uploadDeclarationSchema = z
  .object({
    declaredContentType: z.string().trim().min(1, "Required").max(128, "Too long"),
    byteSize: z
      .number()
      .int("Must be a whole number")
      .min(0, "Must be zero or more")
      .max(MAX_UPLOAD_BYTES, "File is too large"),
  })
  .strict();

export type UploadDeclaration = z.infer<typeof uploadDeclarationSchema>;

/**
 * Why an upload was refused.
 *
 * A closed set so a caller can branch deliberately, and small enough that
 * every member earns its place. Messages are safe to show a person: they
 * describe the file, never the storage, the bucket, or the database.
 */
export type UploadRejectionReason =
  | "empty"
  | "unsupported_declared_type"
  | "unrecognised_content"
  | "type_mismatch"
  | "too_large";

export type UploadPolicyResult =
  | {
      readonly ok: true;
      /** The **sniffed** type, which is what may be persisted. */
      readonly contentType: MediaContentType;
      readonly extension: string;
      readonly byteSize: number;
      readonly isImage: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: UploadRejectionReason;
      readonly message: string;
    };

const REJECTION_MESSAGES: Readonly<Record<UploadRejectionReason, string>> = {
  empty: "That file is empty.",
  unsupported_declared_type:
    "That file type is not supported. Upload a PNG, JPEG, WebP, or PDF.",
  unrecognised_content:
    "That file is not a PNG, JPEG, WebP, or PDF, whatever it is named.",
  type_mismatch: "That file's contents do not match its declared type.",
  too_large: "That file is too large.",
};

function reject(reason: UploadRejectionReason): UploadPolicyResult {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] };
}

export interface UploadCandidate {
  /** What the client says the file is. Checked, never believed. */
  readonly declaredContentType: string;
  /** The file's bytes, or at least its first `SNIFF_BYTE_LENGTH`. */
  readonly bytes: Uint8Array;
  /**
   * The real byte length.
   *
   * Passed separately so a caller that sniffed a head off a stream can still
   * enforce the size ceiling without buffering the whole body. Defaults to
   * `bytes.length` for the common case where the full file is in hand.
   */
  readonly byteSize?: number;
}

/**
 * Decide whether an upload may be stored, and as what.
 *
 * The order is deliberate — each step is cheaper than the next and refuses
 * more input, so the expensive checks only ever see plausible candidates:
 *
 * 1. reject an empty file;
 * 2. reject a declared type that is not on the allowlist, without reading a
 *    byte;
 * 3. sniff the bytes, and reject anything the allowlist does not recognise;
 * 4. reject a declared type that disagrees with the bytes;
 * 5. reject anything over the ceiling **for the type the bytes actually
 *    are** — so a PDF renamed to `.png` cannot borrow the image limit, and a
 *    huge image cannot claim the PDF limit.
 *
 * Step 4 is the one worth stating plainly: on a mismatch the answer is
 * **refuse**, not "trust the bytes and carry on". Silently rewriting a
 * declared type would mean a client could probe which of its lies get
 * corrected, and it turns a signal that something is wrong into a shrug.
 */
export function evaluateUpload(candidate: UploadCandidate): UploadPolicyResult {
  const byteSize = candidate.byteSize ?? candidate.bytes.length;

  if (byteSize <= 0 || candidate.bytes.length === 0) return reject("empty");

  if (!isMediaContentType(candidate.declaredContentType)) {
    return reject("unsupported_declared_type");
  }

  const detected = detectContentType(candidate.bytes);
  if (detected === null) return reject("unrecognised_content");

  if (detected !== candidate.declaredContentType) return reject("type_mismatch");

  if (byteSize > maxBytesFor(detected)) return reject("too_large");

  return {
    ok: true,
    contentType: detected,
    extension: CANONICAL_EXTENSIONS[detected],
    byteSize,
    isImage: isImageContentType(detected),
  };
}
