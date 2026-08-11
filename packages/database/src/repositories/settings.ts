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
    footerNote: nullableString(SITE_ENTITY, row, "footer_note"),
    screenAccents: {
      offline: nullableString(SITE_ENTITY, row, "offline_accent"),
      notFound: nullableString(SITE_ENTITY, row, "not_found_accent"),
      error: nullableString(SITE_ENTITY, row, "error_accent"),
      denied: nullableString(SITE_ENTITY, row, "denied_accent"),
    },
    consoleHeadline: nullableString(SITE_ENTITY, row, "console_headline"),
    consoleBody: nullableString(SITE_ENTITY, row, "console_body"),
    isConsoleEnabled: requireBoolean(SITE_ENTITY, row, "is_console_enabled"),
    isKonamiEnabled: requireBoolean(SITE_ENTITY, row, "is_konami_enabled"),
    faviconMediaId: nullableString(SITE_ENTITY, row, "favicon_media_id"),
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
    isSpeechEnabled: requireBoolean(SCENE_ENTITY, row, "is_speech_enabled"),
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
                    social_image_id, favicon_media_id, is_contact_enabled,
                    footer_note, console_headline, console_body,
                    is_console_enabled, is_konami_enabled,
                    offline_accent, not_found_accent, error_accent,
                    denied_accent, updated_at
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
                social_image_id, favicon_media_id, is_contact_enabled,
                footer_note, console_headline, console_body,
                is_console_enabled, is_konami_enabled,
                offline_accent, not_found_accent, error_accent,
                denied_accent, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               site_name = excluded.site_name,
               site_description = excluded.site_description,
               default_theme = excluded.default_theme,
               accent_color = excluded.accent_color,
               social_image_id = excluded.social_image_id,
               favicon_media_id = excluded.favicon_media_id,
               is_contact_enabled = excluded.is_contact_enabled,
               footer_note = excluded.footer_note,
               console_headline = excluded.console_headline,
               console_body = excluded.console_body,
               is_console_enabled = excluded.is_console_enabled,
               is_konami_enabled = excluded.is_konami_enabled,
               offline_accent = excluded.offline_accent,
               not_found_accent = excluded.not_found_accent,
               error_accent = excluded.error_accent,
               denied_accent = excluded.denied_accent,
               updated_at = excluded.updated_at`,
          )
          .bind(
            SINGLETON_ID,
            input.siteName,
            input.siteDescription ?? null,
            input.defaultTheme ?? "system",
            input.accentColor ?? null,
            input.socialImageId ?? null,
            input.faviconMediaId ?? null,
            boolToInt(input.isContactEnabled ?? true),
            input.footerNote ?? null,
            input.consoleHeadline ?? null,
            input.consoleBody ?? null,
            boolToInt(input.isConsoleEnabled ?? true),
            boolToInt(input.isKonamiEnabled ?? true),
            input.offlineAccent ?? null,
            input.notFoundAccent ?? null,
            input.errorAccent ?? null,
            input.deniedAccent ?? null,
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
                    is_speech_enabled,
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
                is_speech_enabled,
                max_pixel_ratio, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               is_enabled = excluded.is_enabled,
               quality_preset = excluded.quality_preset,
               is_mobile_enabled = excluded.is_mobile_enabled,
               is_speech_enabled = excluded.is_speech_enabled,
               max_pixel_ratio = excluded.max_pixel_ratio,
               updated_at = excluded.updated_at`,
          )
          .bind(
            SINGLETON_ID,
            boolToInt(input.isEnabled ?? false),
            input.qualityPreset ?? "balanced",
            boolToInt(input.isMobileEnabled ?? false),
            boolToInt(input.isSpeechEnabled ?? true),
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
