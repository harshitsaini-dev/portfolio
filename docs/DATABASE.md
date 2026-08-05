# Database

**Status: NOT IMPLEMENTED.** No schema, migrations, or database connection
exists in Phase 1A. This document lists the entities planned for the
future Cloudflare D1 phase so naming stays consistent when that work
begins. Schema design, column types, and relationships are deferred until
that phase.

## Planned entities

- `profile` — the portfolio owner's core identity/bio information.
- `social_links` — external profile links (GitHub, LinkedIn, etc.).
- `resumes` — uploaded resume/CV files and metadata.
- `projects` — portfolio project entries.
- `project_media` — images/video associated with a project.
- `technologies` — reusable technology/tag records.
- `project_technologies` — join table linking projects to technologies.
- `timeline_entries` — career/experience timeline items.
- `education` — education history entries.
- `certifications` — certification records.
- `skill_categories` — grouping for skills.
- `skills` — individual skill records.
- `tools` — tools/software used, distinct from language/framework skills.
- `sections` — configurable page sections (ordering/visibility).
- `site_settings` — global site configuration.
- `scene_settings` — configuration for the future 3D scene.
- `contact_messages` — inbound contact form submissions.

## Access pattern (planned)

All access will go through a repository/service layer in
`packages/database`. Application code in `apps/web`/`apps/admin` will not
issue raw queries directly. See `.claude/skills/cloudflare-d1-r2/SKILL.md`.

## Migrations

Deferred entirely to the D1 phase. No migration tooling is configured yet.
