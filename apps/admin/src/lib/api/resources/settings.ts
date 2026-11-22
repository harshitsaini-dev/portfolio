/**
 * `/settings/site` and `/settings/scene` — mirrors `lib/actions/settings.ts`.
 *
 * ## PATCH only, no PUT
 *
 * The admin saves each of these from one form that always sends every field,
 * and the shared schemas default anything absent. Over an API that is a trap:
 * a client sending one field would reset every other setting — the accent,
 * the contact switch, the console text — to its default. So the API offers
 * a merging PATCH and nothing that replaces wholesale; see `patch.ts`.
 */

import type { Repositories } from "@portfolio/database";
import {
  sceneSettingsSaveSchema,
  siteSettingsSaveSchema,
} from "@portfolio/schemas";
import { SCENE_QUALITY_PRESETS, THEME_PREFERENCES } from "@portfolio/types";

import { defineRoute, ref, type ApiRoute, type JsonSchema } from "../define.ts";
import { patchSchemaOf, sentKeys, validateMerged } from "./patch.ts";
import { entity, primitives } from "./schemas.ts";

const { str, nstr, bool, timestamp } = primitives;
const TAG = "Settings";

/** Stored site settings → the save schema's input keys. */
async function currentSiteInput(repos: Repositories): Promise<Record<string, unknown>> {
  const current = await repos.siteSettings.get();
  if (!current) return {};
  return {
    siteName: current.siteName,
    siteDescription: current.siteDescription,
    defaultTheme: current.defaultTheme,
    accentColor: current.accentColor,
    offlineAccent: current.screenAccents.offline,
    notFoundAccent: current.screenAccents.notFound,
    errorAccent: current.screenAccents.error,
    deniedAccent: current.screenAccents.denied,
    socialImageId: current.socialImageId,
    faviconMediaId: current.faviconMediaId,
    footerNote: current.footerNote,
    consoleHeadline: current.consoleHeadline,
    consoleBody: current.consoleBody,
    isConsoleEnabled: current.isConsoleEnabled,
    isKonamiEnabled: current.isKonamiEnabled,
    isContactEnabled: current.isContactEnabled,
  };
}

async function currentSceneInput(repos: Repositories): Promise<Record<string, unknown>> {
  const current = await repos.sceneSettings.get();
  if (!current) return {};
  return {
    isEnabled: current.isEnabled,
    qualityPreset: current.qualityPreset,
    isMobileEnabled: current.isMobileEnabled,
    isSpeechEnabled: current.isSpeechEnabled,
    maxPixelRatio: current.maxPixelRatio,
  };
}

const accent = { ...nstr, description: "Six-digit hex colour (#rrggbb), or null to follow the site accent." };

export const settingsSchemas: Record<string, JsonSchema> = {
  SiteSettings: entity("Site-wide settings: name, theme, accents, favicon, easter eggs, contact switch.", {
    siteName: str,
    siteDescription: nstr,
    defaultTheme: { type: "string", enum: [...THEME_PREFERENCES] },
    accentColor: { ...nstr, description: "Site accent, #rrggbb, or null for the built-in one." },
    screenAccents: entity("Accent per system screen.", {
      offline: accent,
      notFound: accent,
      error: accent,
      denied: accent,
    }),
    socialImageId: nstr,
    faviconMediaId: nstr,
    footerNote: nstr,
    consoleHeadline: nstr,
    consoleBody: nstr,
    isConsoleEnabled: bool,
    isKonamiEnabled: bool,
    isContactEnabled: bool,
    updatedAt: timestamp,
  }),
  SceneSettings: entity("Settings for the 3D scene on the public site.", {
    isEnabled: bool,
    qualityPreset: { type: "string", enum: [...SCENE_QUALITY_PRESETS] },
    isMobileEnabled: bool,
    isSpeechEnabled: bool,
    maxPixelRatio: { type: "number" },
    updatedAt: timestamp,
  }),
};

export const settingsRoutes: ApiRoute[] = [
  defineRoute({
    method: "GET",
    path: "/settings/site",
    tag: TAG,
    operationId: "getSiteSettings",
    summary: "Get site settings",
    description: "`data` is `null` until settings have been saved once.",
    scope: "read",
    returns: "Site settings, or null.",
    response: { allOf: [ref("SiteSettings")], nullable: true },
    async handler({ repos }) {
      return repos.siteSettings.get();
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/settings/site",
    tag: TAG,
    operationId: "updateSiteSettings",
    summary: "Update some site settings",
    description:
      "Send only the fields to change; everything else keeps its stored value. Note the request uses flat `offlineAccent`/`notFoundAccent`/`errorAccent`/`deniedAccent`, which the response groups under `screenAccents`. Colours are `#rrggbb` (case-insensitive) or `null`/`\"\"` to follow the site accent. `socialImageId`/`faviconMediaId` must name existing media. If no settings exist yet, `siteName` is required.",
    scope: "write",
    body: patchSchemaOf(siteSettingsSaveSchema),
    returns: "The saved site settings.",
    response: ref("SiteSettings"),
    async handler({ repos }, _params, body) {
      const input = validateMerged(siteSettingsSaveSchema, {
        ...(await currentSiteInput(repos)),
        ...sentKeys(body),
      });
      return repos.siteSettings.upsert({
        siteName: input.siteName,
        siteDescription: input.siteDescription,
        defaultTheme: input.defaultTheme,
        accentColor: input.accentColor,
        socialImageId: input.socialImageId,
        faviconMediaId: input.faviconMediaId,
        footerNote: input.footerNote,
        offlineAccent: input.offlineAccent,
        notFoundAccent: input.notFoundAccent,
        errorAccent: input.errorAccent,
        deniedAccent: input.deniedAccent,
        consoleHeadline: input.consoleHeadline,
        consoleBody: input.consoleBody,
        isConsoleEnabled: input.isConsoleEnabled,
        isKonamiEnabled: input.isKonamiEnabled,
        isContactEnabled: input.isContactEnabled,
      });
    },
  }),

  defineRoute({
    method: "GET",
    path: "/settings/scene",
    tag: TAG,
    operationId: "getSceneSettings",
    summary: "Get 3D scene settings",
    description: "`data` is `null` until scene settings have been saved once.",
    scope: "read",
    returns: "Scene settings, or null.",
    response: { allOf: [ref("SceneSettings")], nullable: true },
    async handler({ repos }) {
      return repos.sceneSettings.get();
    },
  }),

  defineRoute({
    method: "PATCH",
    path: "/settings/scene",
    tag: TAG,
    operationId: "updateSceneSettings",
    summary: "Update some 3D scene settings",
    description:
      "Send only the fields to change; the rest keep their stored values (or the defaults, if never saved: disabled, `balanced`, mobile off, speech on, pixel ratio 2).",
    scope: "write",
    body: patchSchemaOf(sceneSettingsSaveSchema),
    returns: "The saved scene settings.",
    response: ref("SceneSettings"),
    async handler({ repos }, _params, body) {
      const input = validateMerged(sceneSettingsSaveSchema, {
        ...(await currentSceneInput(repos)),
        ...sentKeys(body),
      });
      return repos.sceneSettings.upsert(input);
    },
  }),
];
