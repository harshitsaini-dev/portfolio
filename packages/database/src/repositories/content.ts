/**
 * Ordered content repositories: social links, education, certifications,
 * tools, and sections.
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
  Section,
  SectionCreate,
  SectionUpdate,
  SocialLink,
  SocialLinkCreate,
  SocialLinkUpdate,
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
  };
}
