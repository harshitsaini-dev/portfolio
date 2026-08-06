import type { Metadata } from "next";

import { saveProfileAction } from "@/lib/actions/profile";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import {
  emptyProfileValues,
  ProfileForm,
} from "@/components/profile/profile-form";

/**
 * Static, generic metadata.
 *
 * Deliberately NOT `generateMetadata` reading the profile. Phase 6
 * established that route metadata is evaluated independently of the
 * component, so `withAdminPage` cannot protect it — a metadata function
 * that read the record would leak the site owner's name to unauthenticated
 * requests, which is exactly the wrong thing to leak here.
 */
export const metadata: Metadata = {
  title: "Profile · Portfolio Admin",
};

/**
 * The profile editor.
 *
 * One route, no `/new` and no `/[id]`: `profile` is a singleton-key table
 * whose primary key is pinned to `'singleton'`, so there is never more than
 * one record and never a choice of which to edit. A collection-style route
 * shape would imply otherwise.
 *
 * The row may legitimately not exist yet — the schema permits zero or one —
 * so this page renders the same form either way and only changes what it
 * *says*, not what it offers.
 */
export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const profile = await repos.profile.get();
  const isConfigured = profile !== null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Content
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
        Profile
      </h1>

      {isConfigured ? (
        <p className="mt-3 text-sm text-fg-muted">
          Your public identity. Changes take effect wherever the site shows
          your name, headline, or contact details. Last updated{" "}
          {profile.updatedAt.slice(0, 10)}.
        </p>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-strong bg-surface p-6">
          <h2 className="text-base font-semibold text-fg">
            Not configured yet
          </h2>
          <p className="mt-2 text-sm text-fg-muted">
            No profile has been created. Fill in the form below and save to
            create it — there is only ever one profile, so this same screen
            edits it afterwards.
          </p>
        </div>
      )}

      <ProfileForm
        action={saveProfileAction}
        isConfigured={isConfigured}
        initialValues={
          profile
            ? {
                fullName: profile.fullName,
                headline: profile.headline,
                tagline: profile.tagline ?? "",
                bio: profile.bio ?? "",
                location: profile.location ?? "",
                availability: profile.availability ?? "",
                publicEmail: profile.publicEmail ?? "",
              }
            : emptyProfileValues
        }
      />
    </div>
  );
});
