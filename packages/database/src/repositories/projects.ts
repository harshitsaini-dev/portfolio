import {
  PROJECT_LINK_KINDS,
  PROJECT_STATUSES,
  type Project,
  type ProjectCreate,
  type ProjectLink,
  type ProjectLinkInput,
  type ProjectListOptions,
  type ProjectMediaInput,
  type ProjectMediaItem,
  type ProjectUpdate,
  type ProjectWithRelations,
  type Technology,
} from "@portfolio/types";

import type { D1Like, D1PreparedStatement } from "../d1.ts";
import { NotFoundError, toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireBoolean,
  requireEnum,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import {
  boolToInt,
  buildPatch,
  normalizeLimit,
  normalizeOffset,
  placeholders,
  type FieldSpecs,
} from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";
import { toTechnology } from "./technologies.ts";

const ENTITY = "project";

const PROJECT_COLUMNS = `id, slug, title, summary, description, status,
  is_featured, position, period_label, started_on, completed_on,
  cover_media_id, published_at, created_at, updated_at`;

function toProject(row: Row): Project {
  return {
    id: requireString(ENTITY, row, "id"),
    slug: requireString(ENTITY, row, "slug"),
    title: requireString(ENTITY, row, "title"),
    summary: requireString(ENTITY, row, "summary"),
    description: nullableString(ENTITY, row, "description"),
    status: requireEnum(ENTITY, row, "status", PROJECT_STATUSES),
    isFeatured: requireBoolean(ENTITY, row, "is_featured"),
    position: requireNumber(ENTITY, row, "position"),
    periodLabel: nullableString(ENTITY, row, "period_label"),
    startedOn: nullableString(ENTITY, row, "started_on"),
    completedOn: nullableString(ENTITY, row, "completed_on"),
    coverMediaId: nullableString(ENTITY, row, "cover_media_id"),
    publishedAt: nullableString(ENTITY, row, "published_at"),
    createdAt: requireString(ENTITY, row, "created_at"),
    updatedAt: requireString(ENTITY, row, "updated_at"),
  };
}

function toProjectLink(row: Row): ProjectLink {
  return {
    id: requireString("project_link", row, "id"),
    projectId: requireString("project_link", row, "project_id"),
    label: requireString("project_link", row, "label"),
    url: requireString("project_link", row, "url"),
    kind: requireEnum("project_link", row, "kind", PROJECT_LINK_KINDS),
    position: requireNumber("project_link", row, "position"),
  };
}

function toProjectMedia(row: Row): ProjectMediaItem {
  return {
    id: requireString("project_media", row, "id"),
    projectId: requireString("project_media", row, "project_id"),
    mediaAssetId: requireString("project_media", row, "media_asset_id"),
    caption: nullableString("project_media", row, "caption"),
    position: requireNumber("project_media", row, "position"),
  };
}

const PROJECT_PATCH: FieldSpecs<ProjectUpdate> = {
  slug: { column: "slug", encode: (p) => p.slug },
  title: { column: "title", encode: (p) => p.title },
  summary: { column: "summary", encode: (p) => p.summary },
  description: { column: "description", encode: (p) => p.description ?? null },
  status: { column: "status", encode: (p) => p.status },
  isFeatured: {
    column: "is_featured",
    encode: (p) => boolToInt(p.isFeatured ?? false),
  },
  position: { column: "position", encode: (p) => p.position },
  periodLabel: { column: "period_label", encode: (p) => p.periodLabel ?? null },
  startedOn: { column: "started_on", encode: (p) => p.startedOn ?? null },
  completedOn: { column: "completed_on", encode: (p) => p.completedOn ?? null },
  coverMediaId: {
    column: "cover_media_id",
    encode: (p) => p.coverMediaId ?? null,
  },
  publishedAt: { column: "published_at", encode: (p) => p.publishedAt ?? null },
};

/**
 * Project repository.
 *
 * Owns `project_links`, `project_media`, and `project_technologies`. Those
 * join tables get no top-level repository of their own: they have no meaning
 * apart from the project they hang off, and exposing CRUD for them would
 * invite callers to mutate a project's relationships without going through
 * the aggregate that understands them.
 */
export interface ProjectRepository {
  getById(id: string): Promise<Project | null>;
  getBySlug(slug: string): Promise<Project | null>;
  /** Ordered by `position`, using the `(status, position)` index. */
  list(options?: ProjectListOptions): Promise<Project[]>;
  /** Same ordering, with links, media, and technologies attached. */
  listWithRelations(
    options?: ProjectListOptions,
  ): Promise<ProjectWithRelations[]>;
  getBySlugWithRelations(slug: string): Promise<ProjectWithRelations | null>;
  create(input: ProjectCreate): Promise<Project>;
  update(id: string, patch: ProjectUpdate): Promise<Project>;
  delete(id: string): Promise<boolean>;

  /** Replaces the project's links wholesale, in one batch. */
  setLinks(projectId: string, links: readonly ProjectLinkInput[]): Promise<void>;
  listLinks(projectId: string): Promise<ProjectLink[]>;

  /** Replaces the project's media attachments wholesale, in one batch. */
  setMedia(
    projectId: string,
    media: readonly ProjectMediaInput[],
  ): Promise<void>;
  listMedia(projectId: string): Promise<ProjectMediaItem[]>;

  /** Replaces the project's technology tags wholesale, in one batch. */
  setTechnologies(
    projectId: string,
    technologyIds: readonly string[],
  ): Promise<void>;
  listTechnologies(projectId: string): Promise<Technology[]>;

  /**
   * How many projects reference each technology, keyed by technology id.
   *
   * Lives here, not on the technology repository, because
   * `project_technologies` is owned by this aggregate — a second repository
   * querying it would be a second ownership path over the same join table.
   *
   * Exists because that join is `ON DELETE RESTRICT`, which makes "can this
   * technology be deleted?" a question a caller must answer *before*
   * offering the action; otherwise the only way to find out is to try and
   * fail. Technologies with no references are simply absent from the map,
   * so a missing key means zero.
   *
   * One grouped query rather than a count per technology: callers need every
   * count at once, and per-row calls would be N+1.
   */
  countByTechnology(): Promise<Record<string, number>>;
}

export function createProjectRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ProjectRepository {
  async function fetchOne(column: "id" | "slug", value: string) {
    // `column` is one of two literals chosen by the caller inside this
    // module — never caller data — so it cannot carry injected SQL.
    const sql = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE ${column} = ?`;
    const row = await db.prepare(sql).bind(value).first<Row>();
    return row ? toProject(row) : null;
  }

  function listQuery(options: ProjectListOptions | undefined) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    const statuses = options?.statuses;
    if (statuses && statuses.length > 0) {
      // Values are bound; only the placeholder count varies.
      conditions.push(`status IN (${placeholders(statuses.length)})`);
      values.push(...statuses);
    }
    if (options?.featuredOnly) {
      conditions.push("is_featured = 1");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = normalizeLimit(options?.limit);
    const offset = normalizeOffset(options?.offset);

    return {
      sql: `SELECT ${PROJECT_COLUMNS} FROM projects ${where}
            ORDER BY position ASC, created_at ASC
            LIMIT ? OFFSET ?`,
      values: [...values, limit, offset],
    };
  }

  const repository: ProjectRepository = {
    async getById(id) {
      try {
        return await fetchOne("id", id);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async getBySlug(slug) {
      try {
        return await fetchOne("slug", slug);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "read", cause);
      }
    },

    async list(options) {
      try {
        const { sql, values } = listQuery(options);
        const result = await db.prepare(sql).bind(...values).all<Row>();
        return result.results.map(toProject);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list", cause);
      }
    },

    async listWithRelations(options) {
      const projects = await repository.list(options);
      if (projects.length === 0) return [];

      const ids = projects.map((project) => project.id);
      const marks = placeholders(ids.length);

      try {
        // Three bounded queries rather than one wide join: a join across
        // links, media, and technologies multiplies rows together and needs
        // de-duplication on the way back out. Fetching each relation once
        // for the whole page keeps the mapping obvious and is still O(1)
        // queries per page rather than O(n) per project.
        const [linkRows, mediaRows, techRows] = await Promise.all([
          db
            .prepare(
              `SELECT id, project_id, label, url, kind, position
               FROM project_links WHERE project_id IN (${marks})
               ORDER BY project_id, position ASC`,
            )
            .bind(...ids)
            .all<Row>(),
          db
            .prepare(
              `SELECT id, project_id, media_asset_id, caption, position
               FROM project_media WHERE project_id IN (${marks})
               ORDER BY project_id, position ASC`,
            )
            .bind(...ids)
            .all<Row>(),
          db
            .prepare(
              `SELECT pt.project_id AS project_id, t.id, t.name, t.slug,
                      t.category, t.created_at, t.updated_at
               FROM project_technologies pt
               JOIN technologies t ON t.id = pt.technology_id
               WHERE pt.project_id IN (${marks})
               ORDER BY pt.project_id, pt.position ASC`,
            )
            .bind(...ids)
            .all<Row>(),
        ]);

        const linksByProject = groupBy(linkRows.results, "project_id", toProjectLink);
        const mediaByProject = groupBy(mediaRows.results, "project_id", toProjectMedia);
        const techByProject = groupBy(techRows.results, "project_id", toTechnology);

        return projects.map((project) => ({
          ...project,
          links: linksByProject.get(project.id) ?? [],
          media: mediaByProject.get(project.id) ?? [],
          technologies: techByProject.get(project.id) ?? [],
        }));
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list relations", cause);
      }
    },

    async getBySlugWithRelations(slug) {
      const project = await repository.getBySlug(slug);
      if (!project) return null;
      const [links, media, technologies] = await Promise.all([
        repository.listLinks(project.id),
        repository.listMedia(project.id),
        repository.listTechnologies(project.id),
      ]);
      return { ...project, links, media, technologies };
    },

    async create(input) {
      const now = runtime.now();
      const id = runtime.newId();
      try {
        await db
          .prepare(
            `INSERT INTO projects
               (id, slug, title, summary, description, status, is_featured,
                position, period_label, started_on, completed_on,
                cover_media_id, published_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.slug,
            input.title,
            input.summary,
            input.description ?? null,
            input.status ?? "draft",
            boolToInt(input.isFeatured ?? false),
            input.position ?? 0,
            input.periodLabel ?? null,
            input.startedOn ?? null,
            input.completedOn ?? null,
            input.coverMediaId ?? null,
            input.publishedAt ?? null,
            now,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(ENTITY, "create", cause);
      }

      const created = await repository.getById(id);
      if (!created) {
        throw toDatabaseError(
          ENTITY,
          "create",
          new Error("row missing immediately after insert"),
        );
      }
      return created;
    },

    async update(id, patch) {
      // `id`, `createdAt`, and `updatedAt` are absent from PROJECT_PATCH, so
      // there is no path by which a caller can rewrite them.
      const clause = buildPatch(patch, PROJECT_PATCH);
      if (clause.isEmpty) {
        // An empty patch is a no-op, not an error, and must not bump
        // updated_at — that would make "save with no changes" look like an
        // edit in the audit trail.
        const current = await repository.getById(id);
        if (!current) throw new NotFoundError(ENTITY, `no project with id`);
        return current;
      }

      try {
        const result = await db
          .prepare(
            `UPDATE projects SET ${clause.assignments}, updated_at = ?
             WHERE id = ?`,
          )
          .bind(...clause.values, runtime.now(), id)
          .run();
        if ((result.meta?.changes ?? 0) === 0) {
          throw new NotFoundError(ENTITY, `no project with id`);
        }
      } catch (cause) {
        throw toDatabaseError(ENTITY, "update", cause);
      }

      const updated = await repository.getById(id);
      if (!updated) throw new NotFoundError(ENTITY, `no project with id`);
      return updated;
    },

    async delete(id) {
      try {
        // Owned rows in project_links / project_media /
        // project_technologies go with it via ON DELETE CASCADE.
        const result = await db
          .prepare(`DELETE FROM projects WHERE id = ?`)
          .bind(id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "delete", cause);
      }
    },

    async setLinks(projectId, links) {
      const statements: D1PreparedStatement[] = [
        db.prepare(`DELETE FROM project_links WHERE project_id = ?`).bind(projectId),
      ];
      const now = runtime.now();
      links.forEach((link, index) => {
        statements.push(
          db
            .prepare(
              `INSERT INTO project_links
                 (id, project_id, label, url, kind, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              runtime.newId(),
              projectId,
              link.label,
              link.url,
              link.kind ?? "other",
              link.position ?? index,
              now,
              now,
            ),
        );
      });

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set links", cause);
      }
    },

    async listLinks(projectId) {
      try {
        const result = await db
          .prepare(
            `SELECT id, project_id, label, url, kind, position
             FROM project_links WHERE project_id = ? ORDER BY position ASC`,
          )
          .bind(projectId)
          .all<Row>();
        return result.results.map(toProjectLink);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list links", cause);
      }
    },

    async setMedia(projectId, media) {
      const statements: D1PreparedStatement[] = [
        db.prepare(`DELETE FROM project_media WHERE project_id = ?`).bind(projectId),
      ];
      const now = runtime.now();
      media.forEach((item, index) => {
        statements.push(
          db
            .prepare(
              `INSERT INTO project_media
                 (id, project_id, media_asset_id, caption, position, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              runtime.newId(),
              projectId,
              item.mediaAssetId,
              item.caption ?? null,
              item.position ?? index,
              now,
            ),
        );
      });

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set media", cause);
      }
    },

    async listMedia(projectId) {
      try {
        const result = await db
          .prepare(
            `SELECT id, project_id, media_asset_id, caption, position
             FROM project_media WHERE project_id = ? ORDER BY position ASC`,
          )
          .bind(projectId)
          .all<Row>();
        return result.results.map(toProjectMedia);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list media", cause);
      }
    },

    async setTechnologies(projectId, technologyIds) {
      const statements: D1PreparedStatement[] = [
        db
          .prepare(`DELETE FROM project_technologies WHERE project_id = ?`)
          .bind(projectId),
      ];
      technologyIds.forEach((technologyId, index) => {
        statements.push(
          db
            .prepare(
              `INSERT INTO project_technologies (project_id, technology_id, position)
               VALUES (?, ?, ?)`,
            )
            .bind(projectId, technologyId, index),
        );
      });

      try {
        await db.batch(statements);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "set technologies", cause);
      }
    },

    async listTechnologies(projectId) {
      try {
        const result = await db
          .prepare(
            `SELECT t.id, t.name, t.slug, t.category, t.created_at, t.updated_at
             FROM project_technologies pt
             JOIN technologies t ON t.id = pt.technology_id
             WHERE pt.project_id = ?
             ORDER BY pt.position ASC`,
          )
          .bind(projectId)
          .all<Row>();
        return result.results.map(toTechnology);
      } catch (cause) {
        throw toDatabaseError(ENTITY, "list technologies", cause);
      }
    },

    async countByTechnology() {
      try {
        const result = await db
          .prepare(
            `SELECT technology_id, COUNT(*) AS project_count
               FROM project_technologies
              GROUP BY technology_id`,
          )
          .all<Row>();
        const counts: Record<string, number> = {};
        for (const row of result.results) {
          const id = requireString(ENTITY, row, "technology_id");
          const raw = row.project_count;
          // D1 returns COUNT(*) as a number, but the aggregate column is not
          // a schema column, so it is coerced rather than trusted blindly
          // across driver implementations.
          counts[id] = typeof raw === "number" ? raw : Number(raw ?? 0);
        }
        return counts;
      } catch (cause) {
        throw toDatabaseError(ENTITY, "count by technology", cause);
      }
    },
  };

  return repository;
}

/** Group rows by a parent id column, decoding each row exactly once. */
function groupBy<T>(
  rows: readonly Row[],
  key: string,
  decode: (row: Row) => T,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const parentId = row[key];
    if (typeof parentId !== "string") continue;
    const bucket = grouped.get(parentId);
    if (bucket) {
      bucket.push(decode(row));
    } else {
      grouped.set(parentId, [decode(row)]);
    }
  }
  return grouped;
}
