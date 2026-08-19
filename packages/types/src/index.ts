// Shared TypeScript types.
//
// Phase 5 added the portfolio content domain types consumed by
// `@portfolio/database` and, from Phase 6 onward, by the apps. These are
// domain shapes, not database rows — row decoding is private to
// `@portfolio/database`.
export * from "./admin-auth.ts";
export * from "./content.ts";

// Phase 9 adds the structural object-storage contract. It lives here rather
// than in `@portfolio/database` because it is not a database concern, and in
// a shared package rather than in the admin app because the storage seam,
// the test fake, and any future service all have to agree on one shape.
export * from "./storage.ts";
