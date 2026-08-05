---
name: documentation-update
description: Use after completing any task to update the docs that reflect it — especially docs/PROJECT_STATE.md, the single source of truth for what's actually done.
---

# Documentation Update

After any change, before declaring a task done:

1. **Update `docs/PROJECT_STATE.md`** — this is the source of truth for
   current phase, active task, completed work, blockers, known bugs, and
   next suggested task. Only record checks/tests that were *actually run*
   — never claim a check passed that wasn't performed.
2. **Update other affected docs**: `docs/ARCHITECTURE.md` for structural
   changes, `docs/DATABASE.md` for entity changes, `docs/DESIGN.md` for
   UI/design-system decisions, `docs/TESTING.md` for testing approach
   changes, `docs/DEPLOYMENT.md` for deployment/infra changes,
   `docs/DECISIONS.md` for notable architectural decisions (with
   rationale), `docs/CHANGELOG.md` with a dated entry summarizing the
   change.
3. **Summarize after each task**: changed files, tests run and their
   result, any failures, and any manual actions still required from the
   human (e.g. installing something, setting a secret, running a manual
   browser check).
4. **Suggest the next phase/task** in `docs/PROJECT_STATE.md` and/or the
   final report, but do not implement it unless asked.
5. Keep documentation honest and concise — describe what exists, not what
   is planned, unless clearly labeled as a future/planned item.
