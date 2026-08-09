import type { Metadata } from "next";

import {
  saveSceneSettingsAction,
  saveSettingsAction,
} from "@/lib/actions/settings";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { getMediaOptions } from "@/lib/media/options";
import {
  emptySceneValues,
  SceneForm,
} from "@/components/settings/scene-form";
import {
  emptySettingsValues,
  SettingsForm,
} from "@/components/settings/settings-form";

/**
 * Static, generic metadata.
 *
 * Deliberately not `generateMetadata` reading the settings: route metadata is
 * evaluated independently of the component, so `withAdminPage` cannot protect
 * it, and a metadata function that read the record would leak the site name
 * to unauthenticated requests. The same rule every admin route follows.
 */
export const metadata: Metadata = {
  title: "Settings · Portfolio Admin",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const [settings, sceneSettings, mediaOptions] = await Promise.all([
    repos.siteSettings.get(),
    repos.sceneSettings.get(),
    getMediaOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Operations
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Settings
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        Site identity, theme and features. Changes repaint the whole public
        site, not one page.
      </p>

      <SettingsForm
        action={saveSettingsAction}
        mediaOptions={mediaOptions}
        initialValues={
          settings
            ? {
                siteName: settings.siteName,
                siteDescription: settings.siteDescription ?? "",
                defaultTheme: settings.defaultTheme,
                accentColor: settings.accentColor ?? "",
                socialImageId: settings.socialImageId ?? "",
                faviconMediaId: settings.faviconMediaId ?? "",
                isContactEnabled: settings.isContactEnabled,
              }
            : emptySettingsValues
        }
      />

      <section
        aria-labelledby="scene-settings-heading"
        className="mt-16 border-t border-subtle pt-10"
      >
        <h2
          id="scene-settings-heading"
          className="text-3xl font-semibold tracking-tight text-fg"
        >
          3D scene
        </h2>
        <p className="mt-3 text-sm text-fg-muted">
          Off by default. Everything here grants permission — the browser makes
          the final call.
        </p>

        <SceneForm
          action={saveSceneSettingsAction}
          initialValues={
            sceneSettings
              ? {
                  isEnabled: sceneSettings.isEnabled,
                  qualityPreset: sceneSettings.qualityPreset,
                  isMobileEnabled: sceneSettings.isMobileEnabled,
                  isSpeechEnabled: sceneSettings.isSpeechEnabled,
                  maxPixelRatio: String(sceneSettings.maxPixelRatio),
                }
              : emptySceneValues
          }
        />
      </section>
    </div>
  );
});
