import { notFound } from "next/navigation";

import { AuthField, AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { createFirstAdminAction } from "@/lib/auth/actions";
import { getAdminRepositories } from "@/lib/db/binding";

/**
 * Claiming the account, once.
 *
 * ## Why a page like this is not a hole
 *
 * It exists only while no administrator does. The moment one is created this
 * returns a 404 and the action refuses as well — checked in both places,
 * because the render happened at one moment and the write happens at another.
 *
 * It is also meant to be used while **Cloudflare Access is still in front of
 * this app**. That is the sequence, and it is the part worth remembering:
 *
 *   1. Deploy with Access still on.
 *   2. Visit `/setup` — Access is what guards it — and choose a password.
 *   3. Sign in with it, and confirm the emailed code arrives.
 *   4. Only then remove the Access application.
 *
 * Doing step 4 before step 3 is how a person locks themselves out of their own
 * CMS, with no way back in except the Cloudflare dashboard.
 */
export default async function SetupPage() {
  const repositories = await getAdminRepositories();
  if (await repositories.adminAuth.hasAnyUser()) {
    // Not a redirect to the login. A 404 says "there is nothing here", which
    // is both true and the least informative thing it could say.
    notFound();
  }

  return (
    <AuthShell
      title="Create the administrator"
      description="This page works once, and then stops existing. Do it while Cloudflare Access is still protecting this app."
    >
      <AuthForm
        action={createFirstAdminAction}
        submitLabel="Create account"
        pendingLabel="Creating…"
      >
        <AuthField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="username"
          hint="Sign-in codes are sent here. It must be an address you can read."
          autoFocus
        />
        <AuthField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters. Length beats punctuation."
        />
        <AuthField
          id="confirm"
          name="confirm"
          label="Repeat it"
          type="password"
          autoComplete="new-password"
        />
      </AuthForm>
    </AuthShell>
  );
}
