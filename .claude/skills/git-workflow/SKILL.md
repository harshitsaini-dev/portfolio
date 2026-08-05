---
name: git-workflow
description: Use for any git operations — commits, branches, PRs. Covers commit identity, attribution rules, and repository hygiene for this project.
---

# Git Workflow

- **No AI attribution, ever.** Never append "Co-Authored-By: Claude",
  "Generated with Claude Code", or similar to commit messages or PR
  descriptions, and no `Claude-Session` trailer or session URL.
  `.claude/settings.json` sets `attribution.commit` and `attribution.pr`
  to empty strings and `attribution.sessionUrl` to `false` for this reason
  — do not override that behavior manually in commit messages either.
- **Use only the repository owner's git identity** (`git config user.name`
  / `user.email` as already configured on the machine). Do not set or
  change git config.
- **Commit only when explicitly asked.** Do not proactively commit or push.
- **Never use destructive operations** (`reset --hard`, `push --force`,
  `checkout --`, `clean -f`, branch deletion) unless explicitly requested,
  and prefer the least destructive option that achieves the goal.
- **Review before committing:** run `git status` and inspect the diff for
  secrets, build output, `node_modules`, or anything that shouldn't be
  tracked before staging.
- **Never skip hooks** (`--no-verify`) or bypass signing unless explicitly
  asked.
- **Prefer new commits over amending** unless explicitly asked to amend.
- Keep `pnpm-lock.yaml` tracked — it is the source of truth for reproducible
  installs, including in CI.
