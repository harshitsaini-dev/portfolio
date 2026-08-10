/**
 * Ordered content repositories: social links, education, certifications,
 * tools, sections, and the robot's lines.
 *
 * Each declares its own columns, decoder, insert bindings, and patch
 * allowlist, then delegates the shared CRUD plumbing to
 * `createOrderedRepository`. Grouped in one module because they are
 * structurally parallel and small; the exported interfaces stay separate and
 * domain-named.
 */

import type {
  Certification,
  CertificationCreate,
  CertificationUpdate,
  EducationEntry,
  EducationEntryCreate,
  EducationEntryUpdate,
  HeadlineAlternate,
  HeadlineAlternateCreate,
  HeadlineAlternateUpdate,
  Section,
  SectionAlternateField,
  SectionAlternates,
  SectionCreate,
  SectionUpdate,
  SocialLink,
  SocialLinkCreate,
  SocialLinkUpdate,
  RobotLine,
  RobotLineCreate,
  RobotLineUpdate,
  Tool,
  ToolCreate,
  ToolUpdate,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireBoolean,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import {
  createOrderedRepository,
  type OrderedRepository,
} from "../internal/ordered-repository.ts";
import { boolToInt, type FieldSpecs } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

// ---------------------------------------------------------------------------
// Social links
// ---------------------------------------------------------------------------

export type SocialLinkRepository = OrderedRepository<
  SocialLink,
  SocialLinkCreate,
  SocialLinkUpdate
>;

export function createSocialLinkRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): SocialLinkRepository {
  const entity = "social_link";
  return createOrderedRepository<SocialLink, SocialLinkCreate, SocialLinkUpdate>(db, runtime, {
    entity,
    table: "social_links",
    columns:
      "id, label, platform, url, position, is_visible, icon_media_id, created_at, updated_at",
    decode: (row): SocialLink => ({
      id: requireString(entity, row, "id"),
      label: requireString(entity, row, "label"),
      platform: requireString(entity, row, "platform"),
      url: requireString(entity, row, "url"),
      position: requireNumber(entity, row, "position"),
      isVisible: requireBoolean(entity, row, "is_visible"),
      iconMediaId: nullableString(entity, row, "icon_media_id"),
      createdAt: requireString(entity, row, "created_at"),
      updatedAt: requireString(entity, row, "updated_at"),
    }),
    insertColumns: [
      "icon_media_id","label", "platform", "url", "position", "is_visible"],
    insertValues: (input) => [
      input.iconMediaId ?? null,
      input.label,
      input.platform,
      input.url,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      iconMediaId: {
        column: "icon_media_id",
        encode: (p) => p.iconMediaId ?? null,
      },
      label: { column: "label", encode: (p) => p.label },
      platform: { column: "platform", encode: (p) => p.platform },
      url: { column: "url", encode: (p) => p.url },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export type EducationRepository = OrderedRepository<
  EducationEntry,
  EducationEntryCreate,
  EducationEntryUpdate
>;

export function createEducationRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): EducationRepository {
  const entity = "education";
  return createOrderedRepository<EducationEntry, EducationEntryCreate, EducationEntryUpdate>(db, runtime, {
    entity,
    table: "education",
    columns: `id, qualification, institution, field_of_study, summary,
      period_label, started_on, ended_on, position, is_visible,
      icon_media_id, created_at, updated_at`,
    decode: (row): EducationEntry => ({
      id: requireString(entity, row, "id"),
      qualification: requireString(entity, row, "qualification"),
      institution: requireString(entity, row, "institution"),
      fieldOfStudy: nullableString(entity, row, "field_of_study"),
      summary: nullableString(entity, row, "summary"),
      periodLabel: nullableString(entity, row, "period_label"),
      startedOn: nullableString(entity, row, "started_on"),
      endedOn: nullableString(entity, row, "ended_on"),
      position: requireNumber(entity, row, "position"),
      isVisible: requireBoolean(entity, row, "is_visible"),
      iconMediaId: nullableString(entity, row, "icon_media_id"),
      createdAt: requireString(entity, row, "created_at"),
      updatedAt: requireString(entity, row, "updated_at"),
    }),
    insertColumns: [
      "icon_media_id",
      "qualification",
      "institution",
      "field_of_study",
      "summary",
      "period_label",
      "started_on",
      "ended_on",
      "position",
      "is_visible",
    ],
    insertValues: (input) => [
      input.iconMediaId ?? null,
      input.qualification,
      input.institution,
      input.fieldOfStudy ?? null,
      input.summary ?? null,
      input.periodLabel ?? null,
      input.startedOn ?? null,
      input.endedOn ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      iconMediaId: {
        column: "icon_media_id",
        encode: (p) => p.iconMediaId ?? null,
      },
      qualification: { column: "qualification", encode: (p) => p.qualification },
      institution: { column: "institution", encode: (p) => p.institution },
      fieldOfStudy: {
        column: "field_of_study",
        encode: (p) => p.fieldOfStudy ?? null,
      },
      summary: { column: "summary", encode: (p) => p.summary ?? null },
      periodLabel: { column: "period_label", encode: (p) => p.periodLabel ?? null },
      startedOn: { column: "started_on", encode: (p) => p.startedOn ?? null },
      endedOn: { column: "ended_on", encode: (p) => p.endedOn ?? null },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

export type CertificationRepository = OrderedRepository<
  Certification,
  CertificationCreate,
  CertificationUpdate
>;

export function createCertificationRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): CertificationRepository {
  const entity = "certification";
  return createOrderedRepository<Certification, CertificationCreate, CertificationUpdate>(db, runtime, {
    entity,
    table: "certifications",
    columns: `id, title, issuer, credential_id, credential_url, issued_on,
      expires_on, position, is_visible, icon_media_id, created_at, updated_at`,
    decode: (row): Certification => ({
      id: requireString(entity, row, "id"),
      title: requireString(entity, row, "title"),
      issuer: requireString(entity, row, "issuer"),
      credentialId: nullableString(entity, row, "credential_id"),
      credentialUrl: nullableString(entity, row, "credential_url"),
      issuedOn: nullableString(entity, row, "issued_on"),
      expiresOn: nullableString(entity, row, "expires_on"),
      position: requireNumber(entity, row, "position"),
      isVisible: requireBoolean(entity, row, "is_visible"),
      iconMediaId: nullableString(entity, row, "icon_media_id"),
      createdAt: requireString(entity, row, "created_at"),
      updatedAt: requireString(entity, row, "updated_at"),
    }),
    insertColumns: [
      "icon_media_id",
      "title",
      "issuer",
      "credential_id",
      "credential_url",
      "issued_on",
      "expires_on",
      "position",
      "is_visible",
    ],
    insertValues: (input) => [
      input.iconMediaId ?? null,
      input.title,
      input.issuer,
      input.credentialId ?? null,
      input.credentialUrl ?? null,
      input.issuedOn ?? null,
      input.expiresOn ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      iconMediaId: {
        column: "icon_media_id",
        encode: (p) => p.iconMediaId ?? null,
      },
      title: { column: "title", encode: (p) => p.title },
      issuer: { column: "issuer", encode: (p) => p.issuer },
      credentialId: {
        column: "credential_id",
        encode: (p) => p.credentialId ?? null,
      },
      credentialUrl: {
        column: "credential_url",
        encode: (p) => p.credentialUrl ?? null,
      },
      issuedOn: { column: "issued_on", encode: (p) => p.issuedOn ?? null },
      expiresOn: { column: "expires_on", encode: (p) => p.expiresOn ?? null },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type ToolRepository = OrderedRepository<Tool, ToolCreate, ToolUpdate>;

export function createToolRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): ToolRepository {
  const entity = "tool";
  return createOrderedRepository<Tool, ToolCreate, ToolUpdate>(db, runtime, {
    entity,
    table: "tools",
    columns:
      "id, name, purpose, url, position, is_visible, icon_media_id, created_at, updated_at",
    decode: (row): Tool => ({
      id: requireString(entity, row, "id"),
      name: requireString(entity, row, "name"),
      purpose: nullableString(entity, row, "purpose"),
      url: nullableString(entity, row, "url"),
      position: requireNumber(entity, row, "position"),
      isVisible: requireBoolean(entity, row, "is_visible"),
      iconMediaId: nullableString(entity, row, "icon_media_id"),
      createdAt: requireString(entity, row, "created_at"),
      updatedAt: requireString(entity, row, "updated_at"),
    }),
    insertColumns: [
      "icon_media_id","name", "purpose", "url", "position", "is_visible"],
    insertValues: (input) => [
      input.iconMediaId ?? null,
      input.name,
      input.purpose ?? null,
      input.url ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      iconMediaId: {
        column: "icon_media_id",
        encode: (p) => p.iconMediaId ?? null,
      },
      name: { column: "name", encode: (p) => p.name },
      purpose: { column: "purpose", encode: (p) => p.purpose ?? null },
      url: { column: "url", encode: (p) => p.url ?? null },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export interface SectionRepository
  extends OrderedRepository<Section, SectionCreate, SectionUpdate> {
  /** Sections are addressed by their stable machine key in the UI. */
  getByKey(key: string): Promise<Section | null>;
  /**
   * Every section's rotating-label alternates, keyed by section id.
   *
   * One query for the whole page rather than one per section: the public site
   * renders every visible section together, and N sections must not mean N
   * round trips to D1.
   */
  listAlternates(): Promise<Map<string, SectionAlternates>>;
  /** One section's alternates, for the admin's edit form. */
  getAlternates(sectionId: string): Promise<SectionAlternates>;
  /**
   * Replaces one label's alternates wholesale, in a single batch.
   *
   * Wholesale because the editor edits the list as a list — reconciling
   * individual rows would invent identity for strings that have none, and a
   * partial apply would leave a rotation the editor never wrote.
   */
  setAlternates(
    sectionId: string,
    field: SectionAlternateField,
    texts: readonly string[],
  ): Promise<void>;
}

export function createSectionRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): SectionRepository {
  const entity = "section";
  const columns =
    "id, key, title, subtitle, eyebrow, position, is_visible, icon_media_id, created_at, updated_at";

  const decode = (row: Row): Section => ({
    id: requireString(entity, row, "id"),
    key: requireString(entity, row, "key"),
    title: requireString(entity, row, "title"),
    subtitle: nullableString(entity, row, "subtitle"),
    eyebrow: nullableString(entity, row, "eyebrow"),
    position: requireNumber(entity, row, "position"),
    isVisible: requireBoolean(entity, row, "is_visible"),
    iconMediaId: nullableString(entity, row, "icon_media_id"),
    createdAt: requireString(entity, row, "created_at"),
    updatedAt: requireString(entity, row, "updated_at"),
  });

  const base = createOrderedRepository<Section, SectionCreate, SectionUpdate>(db, runtime, {
    entity,
    table: "sections",
    columns,
    decode,
    insertColumns: [
      "icon_media_id",
      "key",
      "title",
      "subtitle",
      "eyebrow",
      "position",
      "is_visible",
    ],
    insertValues: (input: SectionCreate) => [
      input.iconMediaId ?? null,
      input.key,
      input.title,
      input.subtitle ?? null,
      input.eyebrow ?? null,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    // `key` is deliberately absent: it is the stable identifier the UI maps
    // to a component, so renaming it silently would break rendering.
    patch: {
      iconMediaId: {
        column: "icon_media_id",
        encode: (p) => p.iconMediaId ?? null,
      },
      title: { column: "title", encode: (p) => p.title },
      subtitle: { column: "subtitle", encode: (p) => p.subtitle ?? null },
      eyebrow: { column: "eyebrow", encode: (p) => p.eyebrow ?? null },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });

  /** Rows -> the grouped shape every caller actually wants. */
  const groupAlternates = (rows: readonly Row[]): SectionAlternates => {
    const title: string[] = [];
    const eyebrow: string[] = [];
    for (const row of rows) {
      const field = requireString(entity, row, "field");
      const text = requireString(entity, row, "text");
      if (field === "title") title.push(text);
      else if (field === "eyebrow") eyebrow.push(text);
      // No `else`: the column is CHECK-constrained, so a third value cannot
      // exist. If a future migration adds one, dropping it here is the safe
      // failure — a label nobody renders beats a crash.
    }
    return { title, eyebrow };
  };

  return {
    ...base,
    async getByKey(key) {
      try {
        const row = await db
          .prepare(`SELECT ${columns} FROM sections WHERE key = ?`)
          .bind(key)
          .first<Row>();
        return row ? decode(row) : null;
      } catch (cause) {
        throw toDatabaseError(entity, "read", cause);
      }
    },

    async listAlternates() {
      try {
        const { results } = await db
          .prepare(
            `SELECT section_id, field, text
               FROM section_alternates
              ORDER BY section_id, field, position`,
          )
          .all<Row>();
        const bySection = new Map<string, Row[]>();
        for (const row of results ?? []) {
          const sectionId = requireString(entity, row, "section_id");
          const list = bySection.get(sectionId);
          if (list) list.push(row);
          else bySection.set(sectionId, [row]);
        }
        const grouped = new Map<string, SectionAlternates>();
        for (const [sectionId, rows] of bySection) {
          grouped.set(sectionId, groupAlternates(rows));
        }
        return grouped;
      } catch (cause) {
        throw toDatabaseError(entity, "list alternates", cause);
      }
    },

    async getAlternates(sectionId) {
      try {
        const { results } = await db
          .prepare(
            `SELECT field, text
               FROM section_alternates
              WHERE section_id = ?
              ORDER BY field, position`,
          )
          .bind(sectionId)
          .all<Row>();
        return groupAlternates(results ?? []);
      } catch (cause) {
        throw toDatabaseError(entity, "read alternates", cause);
      }
    },

    async setAlternates(sectionId, field, texts) {
      const now = runtime.now();
      try {
        await db.batch([
          db
            .prepare(
              `DELETE FROM section_alternates
                WHERE section_id = ? AND field = ?`,
            )
            .bind(sectionId, field),
          ...texts.map((text, index) =>
            db
              .prepare(
                `INSERT INTO section_alternates
                   (id, section_id, field, text, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              )
              // Position comes from array order, so the editor's arrangement
              // is the stored one and no index needs maintaining separately.
              .bind(runtime.newId(), sectionId, field, text, index, now),
          ),
        ]);
      } catch (cause) {
        throw toDatabaseError(entity, "set alternates", cause);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Robot lines
// ---------------------------------------------------------------------------

export interface HeadlineAlternateRepository
  extends OrderedRepository<
    HeadlineAlternate,
    HeadlineAlternateCreate,
    HeadlineAlternateUpdate
  > {
  /**
   * Replaces the whole list in one batch.
   *
   * The editor manages these as a list inside the profile form, not as
   * individually addressable records — the same reasoning as a section's
   * alternates. The ordered CRUD the base repository provides stays available
   * for anything that later needs it.
   */
  replaceAll(texts: readonly string[]): Promise<void>;
}

/**
 * Alternative phrasings of the hero headline.
 *
 * The same shape as `robot_lines`, and for the same reason: an ordered list of
 * editorial strings with no relationship to anything else. Two alternates may
 * legitimately be identical — the rotation would simply pause on that phrase,
 * which is the editor's business, not the database's.
 *
 * The *first* phrase is not here. It is `profile.headline`, so a profile with
 * no alternates renders exactly as it did before this table existed.
 */
export function createHeadlineAlternateRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): HeadlineAlternateRepository {
  const entity = "headline alternate";
  const base = createOrderedRepository<
    HeadlineAlternate,
    HeadlineAlternateCreate,
    HeadlineAlternateUpdate
  >(db, runtime, {
    entity,
    table: "headline_alternates",
    columns: "id, text, position, is_visible, created_at, updated_at",
    decode: (row): HeadlineAlternate => ({
      id: requireString(entity, row, "id"),
      text: requireString(entity, row, "text"),
      position: requireNumber(entity, row, "position"),
      isVisible: requireBoolean(entity, row, "is_visible"),
      createdAt: requireString(entity, row, "created_at"),
      updatedAt: requireString(entity, row, "updated_at"),
    }),
    insertColumns: ["text", "position", "is_visible"],
    insertValues: (input) => [
      input.text,
      input.position ?? 0,
      boolToInt(input.isVisible ?? true),
    ],
    patch: {
      text: { column: "text", encode: (p) => p.text },
      position: { column: "position", encode: (p) => p.position },
      isVisible: {
        column: "is_visible",
        encode: (p) => boolToInt(p.isVisible ?? true),
      },
    },
  });

  return {
    ...base,
    async replaceAll(texts) {
      const now = runtime.now();
      try {
        await db.batch([
          db.prepare(`DELETE FROM headline_alternates`),
          ...texts.map((text, index) =>
            db
              .prepare(
                `INSERT INTO headline_alternates
                   (id, text, position, is_visible, created_at, updated_at)
                 VALUES (?, ?, ?, 1, ?, ?)`,
              )
              .bind(runtime.newId(), text, index, now, now),
          ),
        ]);
      } catch (cause) {
        throw toDatabaseError(entity, "replace all", cause);
      }
    },
  };
}

export type RobotLineRepository = OrderedRepository<
  RobotLine,
  RobotLineCreate,
  RobotLineUpdate
>;

/**
 * The sentences the hero's robot says.
 *
 * The simplest entry in this module: no media reference, no URL, no unique
 * constraint. Two lines may legitimately be identical — an editor writing the
 * same joke twice is their business, not the database's.
 */
export function createRobotLineRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): RobotLineRepository {
  const entity = "robot line";
  return createOrderedRepository<RobotLine, RobotLineCreate, RobotLineUpdate>(
    db,
    runtime,
    {
      entity,
      table: "robot_lines",
      columns: "id, text, position, is_visible, created_at, updated_at",
      decode: (row): RobotLine => ({
        id: requireString(entity, row, "id"),
        text: requireString(entity, row, "text"),
        position: requireNumber(entity, row, "position"),
        isVisible: requireBoolean(entity, row, "is_visible"),
        createdAt: requireString(entity, row, "created_at"),
        updatedAt: requireString(entity, row, "updated_at"),
      }),
      insertColumns: ["text", "position", "is_visible"],
      insertValues: (input) => [
        input.text,
        input.position ?? 0,
        boolToInt(input.isVisible ?? true),
      ],
      patch: {
        text: { column: "text", encode: (p) => p.text },
        position: { column: "position", encode: (p) => p.position },
        isVisible: {
          column: "is_visible",
          encode: (p) => boolToInt(p.isVisible ?? true),
        },
      },
    },
  );
}
