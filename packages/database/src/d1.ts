/**
 * The minimal D1 contract this package depends on.
 *
 * Declared structurally rather than importing `@cloudflare/workers-types`
 * so the package pulls in no dependency at all — not even a type-only one —
 * and so the surface we rely on is documented in one place. A real
 * `D1Database` binding satisfies this interface structurally, so
 * `createRepositories(env.DB)` type-checks with no cast.
 *
 * Keeping the contract this small also means the layer can be exercised
 * against any SQLite-compatible driver in tests without mocking repository
 * internals.
 */

export interface D1PreparedStatement {
  bind(...values: readonly unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<never>>;
}

export interface D1Result<T = Record<string, unknown>> {
  readonly results: T[];
  readonly success: boolean;
  readonly meta?: {
    readonly changes?: number;
    readonly last_row_id?: number;
    readonly rows_read?: number;
    readonly rows_written?: number;
  };
}

export interface D1Like {
  prepare(query: string): D1PreparedStatement;
  /**
   * D1 executes a batch as a single implicit transaction on one database
   * instance. See `docs/DATABASE.md` for exactly what this layer relies on.
   */
  batch<T = Record<string, unknown>>(
    statements: readonly D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}
