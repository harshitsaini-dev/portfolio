// Shared UI package.
//
// Phase 3 added the semantic design tokens at `./tokens.css`, imported
// directly by each app's global stylesheet. No React components have been
// promoted here yet: the public portfolio is currently the only consumer, and
// a primitive with one consumer is not yet a shared primitive. Revisit when
// `apps/admin` is built (Phase 6) and the real shared surface is known.
/**
 * Shared, framework-free helpers.
 *
 * `accent.ts` is here rather than in either app because both need it: the
 * admin to preview an accent and warn about its contrast, the public site to
 * paint with it.
 */
export * from "./accent.ts";
