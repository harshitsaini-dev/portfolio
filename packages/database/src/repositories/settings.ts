import {
  SCENE_QUALITY_PRESETS,
  THEME_PREFERENCES,
  type SceneSettings,
  type SceneSettingsInput,
  type SiteSettings,
  type SiteSettingsInput,
} from "@portfolio/types";

import type { D1Like } from "../d1.ts";
import { toDatabaseError } from "../errors.ts";
import {
  nullableString,
  requireBoolean,
  requireEnum,
  requireNumber,
  requireString,
  type Row,
} from "../mapping.ts";
import { boolToInt } from "../internal/sql.ts";
import type { RepositoryRuntime } from "../runtime.ts";

const SINGLETON_ID = "singleton";
const SITE_ENTITY = "site_settings";
const SCENE_ENTITY = "scene_settings";

function toSiteSettings(row: Row): SiteSettings {
  return {
    siteName: requireString(SITE_ENTITY, row, "site_name"),
    siteDescription: nullableString(SITE_ENTITY, row, "site_description"),
    defaultTheme: requireEnum(
      SITE_ENTITY,
      row,
      "default_theme",
      THEME_PREFERENCES,
    ),
    accentColor: nullableString(SITE_ENTITY, row, "accent_color"),
    socialImageId: nullableString(SITE_ENTITY, row, "social_image_id"),
    isContactEnabled: requireBoolean(SITE_ENTITY, row, "is_contact_enabled"),
    updatedAt: requireString(SITE_ENTITY, row, "updated_at"),
  };
}

function toSceneSettings(row: Row): SceneSettings {
  return {
    isEnabled: requireBoolean(SCENE_ENTITY, row, "is_enabled"),
    qualityPreset: requireEnum(
      SCENE_ENTITY,
      row,
      "quality_preset",
      SCENE_QUALITY_PRESETS,
    ),
    isMobileEnabled: requireBoolean(SCENE_ENTITY, row, "is_mobile_enabled"),
    maxPixelRatio: requireNumber(SCENE_ENTITY, row, "max_pixel_ratio"),
    updatedAt: requireString(SCENE_ENTITY, row, "updated_at"),
  };
}

/**
 * Settings repositories. Both tables are singleton-key, so both model
 * zero-or-one exactly as the profile repository does.
 */
export interface SiteSettingsRepository {
  get(): Promise<SiteSettings | null>;
  upsert(input: SiteSettingsInput): Promise<SiteSettings>;
}

export interface SceneSettingsRepository {
  get(): Promise<SceneSettings | null>;
  upsert(input: SceneSettingsInput): Promise<SceneSettings>;
}

export function createSiteSettingsRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): SiteSettingsRepository {
  return {
    async get() {
      try {
        const row = await db
          .prepare(
            `SELECT site_name, site_description, default_theme, accent_color,
                    social_image_id, is_contact_enabled, updated_at
             FROM site_settings WHERE id = ?`,
          )
          .bind(SINGLETON_ID)
          .first<Row>();
        return row ? toSiteSettings(row) : null;
      } catch (cause) {
        throw toDatabaseError(SITE_ENTITY, "read", cause);
      }
    },

    async upsert(input) {
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO site_settings
               (id, site_name, site_description, default_theme, accent_color,
                social_image_id, is_contact_enabled, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               site_name = excluded.site_name,
               site_description = excluded.site_description,
               default_theme = excluded.default_theme,
               accent_color = excluded.accent_color,
               social_image_id = excluded.social_image_id,
               is_contact_enabled = excluded.is_contact_enabled,
               updated_at = excluded.updated_at`,
          )
          .bind(
            SINGLETON_ID,
            input.siteName,
            input.siteDescription ?? null,
            input.defaultTheme ?? "system",
            input.accentColor ?? null,
            input.socialImageId ?? null,
            boolToInt(input.isContactEnabled ?? true),
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(SITE_ENTITY, "upsert", cause);
      }

      const saved = await this.get();
      if (!saved) {
        throw toDatabaseError(
          SITE_ENTITY,
          "upsert",
          new Error("row missing immediately after upsert"),
        );
      }
      return saved;
    },
  };
}

export function createSceneSettingsRepository(
  db: D1Like,
  runtime: RepositoryRuntime,
): SceneSettingsRepository {
  return {
    async get() {
      try {
        const row = await db
          .prepare(
            `SELECT is_enabled, quality_preset, is_mobile_enabled,
                    max_pixel_ratio, updated_at
             FROM scene_settings WHERE id = ?`,
          )
          .bind(SINGLETON_ID)
          .first<Row>();
        return row ? toSceneSettings(row) : null;
      } catch (cause) {
        throw toDatabaseError(SCENE_ENTITY, "read", cause);
      }
    },

    async upsert(input) {
      const now = runtime.now();
      try {
        await db
          .prepare(
            `INSERT INTO scene_settings
               (id, is_enabled, quality_preset, is_mobile_enabled,
                max_pixel_ratio, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               is_enabled = excluded.is_enabled,
               quality_preset = excluded.quality_preset,
               is_mobile_enabled = excluded.is_mobile_enabled,
               max_pixel_ratio = excluded.max_pixel_ratio,
               updated_at = excluded.updated_at`,
          )
          .bind(
            SINGLETON_ID,
            boolToInt(input.isEnabled ?? false),
            input.qualityPreset ?? "balanced",
            boolToInt(input.isMobileEnabled ?? false),
            input.maxPixelRatio ?? 2,
            now,
          )
          .run();
      } catch (cause) {
        throw toDatabaseError(SCENE_ENTITY, "upsert", cause);
      }

      const saved = await this.get();
      if (!saved) {
        throw toDatabaseError(
          SCENE_ENTITY,
          "upsert",
          new Error("row missing immediately after upsert"),
        );
      }
      return saved;
    },
  };
}
