/**
 * An in-memory `ObjectStorage` for tests. **Not a production implementation.**
 *
 * Nothing in the application imports this — no page, component, action, or
 * service — and `storage-foundation-tests.mjs` asserts that, so it cannot
 * quietly become a second storage backend. It exists for one reason: the
 * compensation paths the media service will need (put succeeded then the
 * database insert failed; the database delete succeeded then the object
 * delete failed) are **unreachable without injectable failure**. That
 * requirement, not convenience, is why the storage contract is a structural
 * interface at all.
 *
 * It is written in TypeScript rather than left as a test helper so `tsc`
 * proves it satisfies `ObjectStorage`. A fake that has drifted from the
 * contract is worse than no fake: every test built on it keeps passing while
 * describing something that cannot happen.
 *
 * ## Honesty rules
 *
 * The fake must not be more permissive than the real thing. Each of these
 * mirrors behaviour **observed against a real local simulated R2** in the
 * same suite, not behaviour assumed from documentation:
 *
 * - `get` and `head` return `null` for a missing key; they do not throw.
 * - `delete` of a missing key resolves quietly.
 * - `put` overwrites an existing key without complaint.
 * - stored bytes are **copied** on the way in and on the way out, so a test
 *   that mutates its input buffer afterwards cannot appear to have changed
 *   what was stored. Real storage has no shared reference to the caller's
 *   array, and neither does this.
 * - `list` returns keys in lexicographic order, applies `prefix`, and honours
 *   `limit` by reporting `truncated` with a cursor.
 */

import type {
  ListObjectsOptions,
  ListedObjects,
  ObjectStorage,
  PutObjectOptions,
  StoredObject,
  StoredObjectBody,
} from "@portfolio/types";

interface StoredEntry {
  readonly bytes: Uint8Array;
  readonly contentType: string | undefined;
}

/** A failure a test can arm on the next matching call. */
export type FaultOperation = "put" | "get" | "head" | "delete" | "list";

export interface MemoryObjectStorage extends ObjectStorage {
  /**
   * Make the next call to `operation` reject.
   *
   * One-shot: it arms a single failure, so a test can prove the *next*
   * attempt succeeds without having to disarm anything. That mirrors the
   * shape of the compensation paths, where exactly one step fails.
   */
  failNext(operation: FaultOperation, error?: Error): void;
  /**
   * Make the next `put` resolve to `null` **without storing anything**.
   *
   * Not a fault — this is R2's conditional-write decline, observed against a
   * real local bucket: the promise resolves, the value is `null`, and the
   * object is not written. It is modelled because that is precisely the case
   * where "the promise resolved, so it worked" would persist metadata for a
   * file that does not exist. One-shot, like `failNext`.
   */
  declineNextPut(): void;
  /** Disarm every armed fault. */
  clearFaults(): void;
  /** Keys currently held, in lexicographic order. Test inspection only. */
  keys(): string[];
  /** The stored content type for a key, or `undefined`. Test inspection only. */
  contentTypeOf(key: string): string | undefined;
  /** Number of objects held. Test inspection only. */
  readonly size: number;
}

function toBytes(body: ArrayBuffer | Uint8Array): Uint8Array {
  // Copy rather than retain: see the honesty rules above.
  return body instanceof Uint8Array
    ? new Uint8Array(body)
    : new Uint8Array(new Uint8Array(body));
}

/** Build a fresh, empty in-memory storage. */
export function createMemoryObjectStorage(): MemoryObjectStorage {
  const objects = new Map<string, StoredEntry>();
  const faults = new Map<FaultOperation, Error>();
  let declineNext = false;

  /** Consume an armed fault for `operation`, if there is one. */
  function trip(operation: FaultOperation): void {
    const error = faults.get(operation);
    if (!error) return;
    faults.delete(operation);
    throw error;
  }

  function describe(key: string, entry: StoredEntry): StoredObject {
    return { key, size: entry.bytes.length };
  }

  const storage: MemoryObjectStorage = {
    async put(
      key: string,
      body: ArrayBuffer | Uint8Array,
      options?: PutObjectOptions,
    ): Promise<StoredObject | null> {
      trip("put");
      if (declineNext) {
        // Decline WITHOUT storing — the whole point of modelling this.
        declineNext = false;
        return null;
      }
      const entry: StoredEntry = {
        bytes: toBytes(body),
        contentType: options?.httpMetadata?.contentType,
      };
      objects.set(key, entry);
      return describe(key, entry);
    },

    async get(key: string): Promise<StoredObjectBody | null> {
      trip("get");
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.bytes.length,
        async arrayBuffer(): Promise<ArrayBuffer> {
          // A fresh copy per call, so a caller cannot mutate the store.
          const copy = new Uint8Array(entry.bytes);
          return copy.buffer as ArrayBuffer;
        },
      };
    },

    async head(key: string): Promise<StoredObject | null> {
      trip("head");
      const entry = objects.get(key);
      return entry ? describe(key, entry) : null;
    },

    async delete(key: string): Promise<void> {
      trip("delete");
      // Missing keys resolve quietly — absence is the desired end state.
      objects.delete(key);
    },

    async list(options?: ListObjectsOptions): Promise<ListedObjects> {
      trip("list");
      const prefix = options?.prefix ?? "";
      const cursor = options?.cursor;
      const all = [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .filter((key) => (cursor === undefined ? true : key > cursor))
        .sort();

      const limit = options?.limit;
      if (limit === undefined || all.length <= limit) {
        return {
          objects: all.map((key) => describe(key, objects.get(key)!)),
          truncated: false,
        };
      }

      const page = all.slice(0, limit);
      return {
        objects: page.map((key) => describe(key, objects.get(key)!)),
        truncated: true,
        cursor: page[page.length - 1],
      };
    },

    failNext(operation: FaultOperation, error?: Error): void {
      faults.set(
        operation,
        error ?? new Error(`injected ${operation} failure`),
      );
    },

    declineNextPut(): void {
      declineNext = true;
    },

    clearFaults(): void {
      faults.clear();
      declineNext = false;
    },

    keys(): string[] {
      return [...objects.keys()].sort();
    },

    contentTypeOf(key: string): string | undefined {
      return objects.get(key)?.contentType;
    },

    get size(): number {
      return objects.size;
    },
  };

  return storage;
}
