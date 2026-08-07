/**
 * The project's canonical slug grammar.
 *
 * Lowercase alphanumerics separated by single hyphens, with no leading or
 * trailing hyphen. **Shape is this schema's job; uniqueness stays the
 * database's**, enforced by the relevant table's UNIQUE constraint — an
 * application-level uniqueness check would be a race, and the constraint is
 * the only authority that cannot be bypassed.
 *
 * ## Why it lives here
 *
 * Projects (Phase 7) and technologies (Phase 8) each declared this grammar
 * independently, and they agree today only by coincidence of copying. A slug
 * is a URL-visible identifier, so two entities disagreeing about what a
 * valid slug looks like is a real inconsistency rather than a difference of
 * editorial taste — the sort of divergence worth preventing structurally.
 *
 * Skill categories are the third consumer, so the grammar was given a single
 * home rather than a third copy. `technologies.ts` now imports it; the rule
 * it applies is unchanged.
 *
 * **`projects.ts` deliberately still carries its own identical copy** — it
 * was out of scope for the Skills slice. Consolidating it is a known,
 * behaviour-neutral follow-up, not an open defect.
 *
 * Internal to the package: not re-exported from `index.ts`, because callers
 * should use the entity schemas rather than assemble their own.
 */

import { z } from "zod";

/** Editorial ceiling, matching the existing consumers. */
export const SLUG_MAX_LENGTH = 96;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_MESSAGE = "Use lowercase letters, numbers, and single hyphens";

/**
 * A required slug.
 *
 * `.toLowerCase()` normalises rather than rejects, so "React-Hooks" becomes
 * "react-hooks" instead of erroring — the intent is unambiguous and there is
 * nothing to ask the user about.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(SLUG_MAX_LENGTH, "Too long")
  .regex(SLUG_PATTERN, SLUG_MESSAGE);
