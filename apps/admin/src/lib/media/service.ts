/**
 * The media service: the only place object storage and D1 metadata are
 * coordinated.
 *
 * React components and Server Actions must never orchestrate R2 and D1
 * themselves — the same rule the repository layer already enforces for SQL,
 * and for a stronger reason. These are **two independent systems with no
 * shared transaction**, so every write has a failure mode where one side
 * succeeded and the other did not. Spread that across call sites and each one
 * invents its own half-correct recovery.
 *
 * ## The governing rule
 *
 * **Metadata must never outlive its object.** An orphaned object is invisible,
 * costs a little storage, and is exactly recoverable — `storage_key` is UNIQUE
 * and `getByStorageKey()` exists, so a key listing diffed against D1 finds it.
 * A metadata row pointing at a missing object is a broken image on a public
 * portfolio. They are not equally bad, so the write order is chosen to make
 * the first one the only reachable residue:
 *
 * | Flow | Order | Failure leaves |
 * | --- | --- | --- |
 * | create | R2 put, **then** D1 insert | an object with no row |
 * | delete | D1 delete, **then** R2 delete | an object with no row |
 *
 * Ordering alone is not enough, because a failed write does not prove nothing
 * was written. The repository's `create()` reads the row back *outside* its
 * own try block, so it can throw with the row already committed. Compensation
 * therefore **deletes the object only when the row is positively known to be
 * absent**; when the row is present, or when its presence cannot be
 * determined, the object is kept. That leaves residue in the indeterminate
 * case — an object that may have no row — which is the tolerated direction,
 * reported through `cleanupRequired` and a diagnostic rather than pretended
 * away.
 *
 * ## What this layer deliberately does NOT do
 *
 * **No authorization.** This service sits *below* the Server Action boundary
 * and is given its dependencies rather than resolving them, so there is no
 * request context here to authorize against. Duplicating an Access check here
 * would be a second, weaker copy of the real one.
 *
 * The future action flow stays:
 *
 *     Server Action
 *       → requireAdminIdentity()      ← authorization, FIRST
 *       → parse the upload
 *       → media service
 *
 * **`requireAdminIdentity()` must run before a byte is read and before
 * storage is resolved**, exactly as it already does before validation and the
 * database in every existing action. An upload handler that parses a
 * multipart body before authorizing has already spent the work an
 * unauthenticated caller wanted it to spend.
 *
 * **No detaching.** A referenced asset is refused, never quietly detached —
 * removing a published project's cover image is an editorial act, not a
 * side effect of tidying a media library.
 */

import "server-only";

import type {
  MediaAsset,
  ObjectStorage,
  ProjectMediaReferenceCounts,
} from "@portfolio/types";
import {
  ConflictError,
  type IdGenerator,
  type MediaAssetRepository,
  type ProjectRepository,
  type ResumeRepository,
  type SiteSettingsRepository,
} from "@portfolio/database";
import {
  buildStorageKey,
  evaluateUpload,
  type MediaContentType,
  type StorageNamespace,
} from "@portfolio/schemas";

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

/**
 * Why a media operation did not succeed.
 *
 * Six cases, each earning its place by changing what a caller does:
 * `validation` is the editor's fault and fixable, `in_use` needs a different
 * action first, `not_found` means the record is already gone, and the three
 * infrastructure cases are all "try again later" but distinguish *which*
 * system failed for the server log.
 */
export type MediaFailureReason =
  | "validation"
  | "not_found"
  | "in_use"
  | "key_unavailable"
  | "storage_failure"
  | "persistence_failure";

export interface MediaFailure {
  readonly ok: false;
  readonly reason: MediaFailureReason;
  /**
   * Safe to show a person. Describes the file or the record — never the
   * bucket, the object key, the database, or a driver message.
   */
  readonly message: string;
  /**
   * **Server-side signal only.** An object was left in storage that no
   * metadata row references, so a reconciliation pass should remove it.
   * Deliberately a bare boolean carrying no key, so that handing a whole
   * failure to a UI cannot leak one.
   */
  readonly cleanupRequired: boolean;
}

export interface MediaDeletion {
  readonly id: string;
  /**
   * Whether the object itself was removed.
   *
   * `false` means the metadata is gone — so nothing can resolve the asset any
   * more, which is what the editor asked for — but the object survived a
   * failed storage delete and needs reconciling. A caller must not report
   * that as a fully clean deletion.
   */
  readonly objectRemoved: boolean;
}

export type MediaResult<T> = { readonly ok: true; readonly data: T } | MediaFailure;

/**
 * A server-side diagnostic. Never reaches a browser.
 *
 * The project has no logging subsystem and this slice does not invent one, so
 * this is a plain injected callback. It carries the storage key precisely
 * because that is the thing a human needs in order to reconcile, and it is
 * kept off `MediaFailure` for exactly the same reason.
 */
export interface MediaDiagnostic {
  readonly kind:
    | "orphaned_object"
    | "compensation_failed"
    | "duplicate_key_conflict"
    /**
     * A create failed and the service could not determine whether the
     * metadata row landed, so it kept the object rather than risk stranding
     * a live row. Needs a human to compare the key against `media_assets`.
     */
    | "indeterminate_persistence";
  readonly storageKey: string;
  readonly cause?: unknown;
}

function fail(
  reason: MediaFailureReason,
  message: string,
  cleanupRequired = false,
): MediaFailure {
  return { ok: false, reason, message, cleanupRequired };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * What an asset is for. Closed, and it decides the storage namespace.
 *
 * A caller cannot pass a storage prefix: an arbitrary string here would be
 * user-influenced path input reaching an object key, which is the one thing
 * the key grammar exists to prevent.
 */
export type MediaPurpose = StorageNamespace;

export interface CreateMediaAssetInput {
  readonly purpose: MediaPurpose;
  /** What the caller says the file is. Checked against the bytes, never believed. */
  readonly declaredContentType: string;
  readonly bytes: Uint8Array;
  /** Required for images; ignored for documents. See the alt-text rule below. */
  readonly altText?: string | null;
}

export interface MediaServiceDependencies {
  readonly storage: ObjectStorage;
  readonly media: MediaAssetRepository;
  readonly projects: ProjectRepository;
  readonly resumes: ResumeRepository;
  readonly siteSettings: SiteSettingsRepository;
  readonly newId: IdGenerator;
  readonly onDiagnostic?: (event: MediaDiagnostic) => void;
}

export interface MediaService {
  createAsset(input: CreateMediaAssetInput): Promise<MediaResult<MediaAsset>>;
  deleteAsset(id: string): Promise<MediaResult<MediaDeletion>>;
}

/**
 * How many distinct keys to try before giving up.
 *
 * With UUIDv7 this loop should never run twice. It exists because R2 `put`
 * **overwrites silently** — verified against a real local bucket — so a key
 * that is already occupied must never be written to, and "collisions are
 * unlikely" is not a safety argument when the consequence is destroying
 * somebody's published image.
 */
const MAX_KEY_ATTEMPTS = 5;

const GENERIC_STORAGE_FAILURE = "The file could not be stored. Try again.";
const GENERIC_PERSISTENCE_FAILURE = "The file could not be saved. Try again.";

export function createMediaService(
  deps: MediaServiceDependencies,
): MediaService {
  function report(event: MediaDiagnostic): void {
    // A diagnostic sink must never be able to fail an operation.
    try {
      deps.onDiagnostic?.(event);
    } catch {
      /* ignore */
    }
  }

  /**
   * Find a key that neither D1 metadata nor storage already owns.
   *
   * Both checks matter and neither substitutes for the other. D1 answers
   * "does an asset already claim this key?"; storage answers "is there an
   * object here anyway?" — which catches an orphan from an earlier failed
   * create, whose bytes are still somebody's until a reconciliation removes
   * them. Writing over either would be silent data loss that no error
   * surfaces, because `put` succeeds.
   */
  async function reserveKey(
    namespace: StorageNamespace,
    contentType: MediaContentType,
  ): Promise<{ key: string } | MediaFailure> {
    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
      const key = buildStorageKey({
        namespace,
        contentType,
        id: deps.newId(),
      });

      let claimed: MediaAsset | null;
      try {
        claimed = await deps.media.getByStorageKey(key);
      } catch {
        return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
      }
      if (claimed) continue;

      let existing: { key: string } | null;
      try {
        existing = await deps.storage.head(key);
      } catch {
        return fail("storage_failure", GENERIC_STORAGE_FAILURE);
      }
      if (existing) continue;

      return { key };
    }

    // Every attempt collided. That is not a user error and not a transient
    // one; something is badly wrong with id generation, so it fails loudly
    // rather than overwriting anything.
    return fail("key_unavailable", GENERIC_STORAGE_FAILURE);
  }

  const service: MediaService = {
    async createAsset(input) {
      // 1. Policy, on the bytes. Nothing below runs for a rejected upload —
      //    in particular, storage is never touched, so an unsupported or
      //    oversized file costs no write.
      const decision = evaluateUpload({
        declaredContentType: input.declaredContentType,
        bytes: input.bytes,
      });
      if (!decision.ok) return fail("validation", decision.message);

      // 2. The alt-text invariant. Migration `0001` says alt text is
      //    "required for images so an alt text can never be silently omitted
      //    at render time", but the column is nullable with no CHECK — the
      //    schema cannot express "required only for images", because nothing
      //    in the row distinguishes an image from a PDF. So the rule is real
      //    and this is where it lives. See docs/DATABASE.md.
      const altText =
        typeof input.altText === "string" && input.altText.trim().length > 0
          ? input.altText.trim()
          : null;
      if (decision.isImage && altText === null) {
        return fail(
          "validation",
          "Images need alt text describing them for people using a screen reader.",
        );
      }

      // 3. A key nothing else owns.
      const reserved = await reserveKey(input.purpose, decision.contentType);
      if ("ok" in reserved) return reserved;
      const { key } = reserved;

      // 4. Storage first, so a failure here leaves no metadata at all.
      try {
        const stored = await deps.storage.put(key, input.bytes, {
          httpMetadata: { contentType: decision.contentType },
        });
        // `null` means the write was DECLINED, not that it succeeded with no
        // detail — confirmed against a real local bucket, where an
        // unconditional put always resolves to an object and only a
        // conditional one returns null without writing. Treating it as
        // success is exactly how a metadata row ends up pointing at a file
        // that was never written.
        if (stored === null) {
          return fail("storage_failure", GENERIC_STORAGE_FAILURE);
        }
      } catch {
        return fail("storage_failure", GENERIC_STORAGE_FAILURE);
      }

      // 5. Metadata second.
      try {
        const asset = await deps.media.create({
          storageKey: key,
          contentType: decision.contentType,
          byteSize: decision.byteSize,
          altText,
          // Deliberately null. Nothing here can measure image dimensions or
          // compute a checksum without adding a decoder or a hashing step
          // this slice has not approved, and a fabricated value in a column
          // the public site will trust is worse than an honest absence.
          width: null,
          height: null,
          checksum: null,
        });
        return { ok: true, data: asset };
      } catch (cause) {
        // 6. Compensate — but only when the object is provably ours.
        //
        // A UNIQUE conflict on `storage_key` means another row already claims
        // this key. Our preflight said otherwise moments ago, so something
        // raced us. Deleting now would remove the object *that row* points
        // at, converting a failed upload into somebody else's broken image.
        // The safe move is to leave it and record the orphan.
        if (cause instanceof ConflictError) {
          report({ kind: "duplicate_key_conflict", storageKey: key, cause });
          return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE, true);
        }

        // A thrown `create()` does NOT prove the row is absent.
        //
        // `createMediaAssetRepository.create()` runs its INSERT inside a try
        // and then reads the row back **outside** it, so a read-back failure
        // throws while the row is already committed. Compensating blindly
        // there would delete the object out from under a live row — a
        // metadata row pointing at a missing file, which is the single
        // residue this whole ordering model exists to rule out. An orphaned
        // object is recoverable; a broken image on the public site is not.
        //
        // So the object is only ever deleted once the row is *positively
        // known* to be absent.
        let landed: MediaAsset | null;
        try {
          landed = await deps.media.getByStorageKey(key);
        } catch (lookupCause) {
          // State is indeterminate. Note this is deliberately not written as
          // `.catch(() => null)`: treating a failed lookup as "no row" is the
          // same mistake as treating a declined put as a successful write,
          // and it reintroduces exactly the defect above. Keep the object,
          // flag it, and let a human reconcile.
          report({
            kind: "indeterminate_persistence",
            storageKey: key,
            cause: lookupCause,
          });
          return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE, true);
        }

        if (landed) {
          // The row landed and its object is intact, so the two systems agree
          // and there is nothing to reconcile — the caller simply did not get
          // the asset back. Deleting here is what would break it.
          return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
        }

        try {
          await deps.storage.delete(key);
          // Compensation worked: no row, no object. Still a failure — the
          // caller asked for an upload and does not have one.
          return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
        } catch (cleanupCause) {
          // Compensation itself failed. The ORIGINAL failure stays primary;
          // the orphan is reported for reconciliation, never as a success.
          report({ kind: "compensation_failed", storageKey: key, cause: cleanupCause });
          return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE, true);
        }
      }
    },

    async deleteAsset(id) {
      let asset: MediaAsset | null;
      try {
        asset = await deps.media.getById(id);
      } catch {
        return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
      }
      if (!asset) return fail("not_found", "That file no longer exists.");

      // Reference safety, BEFORE anything is removed.
      //
      // Two of the four references into `media_assets` are RESTRICT and would
      // block the delete on their own. The other two are SET NULL: the
      // database would carry out the delete and silently clear a project's
      // cover image or the site's social share image. So catching a
      // foreign-key error is not a safety check — for half the references
      // there is no error to catch.
      let projectRefs: ProjectMediaReferenceCounts;
      let resumeRefs: number;
      let isSocialImage: boolean;
      try {
        const [projects, resumes, settings] = await Promise.all([
          deps.projects.countMediaReferences(id),
          deps.resumes.countByMediaAsset(id),
          deps.siteSettings.get(),
        ]);
        projectRefs = projects;
        resumeRefs = resumes;
        isSocialImage = settings?.socialImageId === id;
      } catch {
        return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
      }

      const inUse = describeReferences(projectRefs, resumeRefs, isSocialImage);
      if (inUse) return fail("in_use", inUse);

      // D1 first: a row must never outlive its object.
      let removed: boolean;
      try {
        removed = await deps.media.delete(id);
      } catch {
        // Storage is deliberately untouched — the metadata still points at a
        // real object, which is the safe state to stay in.
        return fail("persistence_failure", GENERIC_PERSISTENCE_FAILURE);
      }
      if (!removed) return fail("not_found", "That file no longer exists.");

      // Storage second. A missing object deletes quietly, so a row whose
      // object had already vanished still cleans up.
      try {
        await deps.storage.delete(asset.storageKey);
      } catch (cause) {
        // The editorial intent succeeded: nothing can resolve this asset any
        // more. The object survives and needs reconciling, so the caller is
        // told the difference rather than being handed a clean success.
        report({ kind: "orphaned_object", storageKey: asset.storageKey, cause });
        return { ok: true, data: { id, objectRemoved: false } };
      }

      return { ok: true, data: { id, objectRemoved: true } };
    },
  };

  return service;
}

/**
 * Name what is using an asset, or `null` when nothing is.
 *
 * The message names the remedy the editor can actually perform — detach,
 * change the cover, replace the résumé's file — because guidance that names
 * an operation the CMS does not offer is worse than none. Same rule the
 * skills slice established for in-use categories.
 */
function describeReferences(
  projects: ProjectMediaReferenceCounts,
  resumes: number,
  isSocialImage: boolean,
): string | null {
  const used: string[] = [];
  if (projects.covers > 0) {
    used.push(
      projects.covers === 1
        ? "a project's cover image"
        : `the cover image of ${projects.covers} projects`,
    );
  }
  if (projects.attachments > 0) {
    used.push(
      projects.attachments === 1
        ? "a project's media"
        : `the media of ${projects.attachments} projects`,
    );
  }
  if (resumes > 0) {
    used.push(resumes === 1 ? "a résumé" : `${resumes} résumés`);
  }
  if (isSocialImage) used.push("the site's social share image");

  if (used.length === 0) return null;
  return `This file is still used as ${joinList(used)}. Remove it there first.`;
}

function joinList(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]!}`;
}
