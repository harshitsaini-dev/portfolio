// Database package.
//
// Phase 4 delivered the D1 schema as versioned SQL migrations in the
// repository-root `migrations/` directory, plus the migration smoke test in
// `scripts/`. It deliberately added NO runtime code here.
//
// The repository/service layer — prepared statements, queries, and the
// typed data access API that `apps/web` and `apps/admin` will consume — is
// Phase 5. Application code must never issue raw SQL directly; it goes
// through this package once that layer exists. See docs/DATABASE.md.
export {};
