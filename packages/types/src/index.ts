// Shared TypeScript types.
//
// Phase 5 added the portfolio content domain types consumed by
// `@portfolio/database` and, from Phase 6 onward, by the apps. These are
// domain shapes, not database rows — row decoding is private to
// `@portfolio/database`.
export * from "./content.ts";
