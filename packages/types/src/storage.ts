/**
 * The minimal object-storage contract the application depends on.
 *
 * Declared structurally rather than importing `@cloudflare/workers-types`,
 * for exactly the reasons `D1Like` in `@portfolio/database` is: the package
 * pulls in no dependency at all — not even a type-only one — and the surface
 * we actually rely on is written down in one place instead of being implied
 * by whatever a vendor type happens to expose.
 *
 * A real Cloudflare `R2Bucket` satisfies this interface structurally, so a
 * Worker can hand `env.MEDIA` straight to the provider seam with no cast.
 * That claim is not asserted here and hoped for — it is compiled against
 * Wrangler's own generated runtime types by
 * `apps/admin/scripts/storage-foundation-tests.mjs`, and the same suite runs
 * the contract against a **real local simulated R2** so the runtime semantics
 * below are observed rather than assumed.
 *
 * ## Why this is so much smaller than R2
 *
 * R2 also offers multipart uploads, conditional reads and writes, range
 * requests, custom metadata, checksums, and bulk delete. None of that is
 * needed by the media service described in `docs/ARCHITECTURE.md`, and every
 * method exposed here is one a future caller could reach for. The contract
 * is deliberately the five operations the documented upload, delete, and
 * orphan-recovery flows actually use — `list` earns its place only because
 * orphan reconciliation is a documented requirement, not a hypothetical one.
 */

/** Metadata a caller may attach to a stored object. */
export interface ObjectHttpMetadata {
  readonly contentType?: string;
}

/** What object storage reports about an object it holds. */
export interface StoredObject {
  readonly key: string;
  readonly size: number;
}

/** A stored object together with its bytes. */
export interface StoredObjectBody extends StoredObject {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PutObjectOptions {
  readonly httpMetadata?: ObjectHttpMetadata;
}

export interface ListObjectsOptions {
  readonly prefix?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListedObjects {
  readonly objects: readonly StoredObject[];
  /** More results exist; pass the cursor back to continue. */
  readonly truncated: boolean;
  readonly cursor?: string;
}

/**
 * Object storage, as this application uses it.
 *
 * Observed semantics, verified against a real local simulated R2 rather than
 * assumed — the in-memory fake is held to the same behaviour:
 *
 * - `get` and `head` return **`null`** for a missing key; they do not throw.
 * - `delete` of a missing key **resolves**; absence is the desired end state
 *   either way, so it is not an error.
 * - `put` overwrites an existing key silently. Nothing in this application
 *   relies on that, because keys are generated per object and never reused.
 *
 * `put` resolves to `StoredObject | null` because R2's conditional-write
 * overload can **decline to write**. Measured against a real local bucket: an
 * unconditional put always resolves to an object, while a conditional one
 * that fails its precondition resolves to `null` **and stores nothing**.
 *
 * So `null` means *not written*, and a caller must treat it as a failure.
 *
 * > **Correction.** An earlier revision of this comment said the media
 * > service "treats a promise that resolves *at all* as success and does not
 * > read the value". That was unsafe: on a declined write it would persist a
 * > metadata row pointing at an object that does not exist — precisely the
 * > state the whole ordering model exists to prevent. The contract shape is
 * > unchanged; only this rationale was wrong. `createMediaService` checks for
 * > `null` explicitly and reports a storage failure.
 *
 * The metadata the service persists still comes from its own validated
 * input, never from what storage echoes back — that part was right.
 */
export interface ObjectStorage {
  put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    options?: PutObjectOptions,
  ): Promise<StoredObject | null>;
  get(key: string): Promise<StoredObjectBody | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  list(options?: ListObjectsOptions): Promise<ListedObjects>;
}
