import { withAdminPage } from "@/lib/auth/protected-page";
import { ChangePassword } from "@/components/auth/change-password";
import { identityLabel } from "@/lib/auth/identity";

export const metadata = { title: "Account · Portfolio Admin" };

/**
 * Changing the password, from inside.
 *
 * Three things are required together: the current password, a code from the
 * inbox, and the new password twice. That is more than most sites ask, and it
 * is asked for a reason — this is the one form that can replace the credential
 * itself, so the session alone must not be enough. A session proves a browser
 * was signed in at some point; it does not prove who is at the keyboard now,
 * and an unattended laptop should not be a way to take the account.
 */
export default withAdminPage(async ({ identity }) => {
  const isSession = identity.source === "admin-session";

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Signed in as {identityLabel(identity)}.
      </p>

      {isSession ? (
        <div className="mt-8">
          <ChangePassword email={identity.email ?? ""} />
        </div>
      ) : (
        /*
          Reached through Cloudflare Access or the development identity.
          There is no password of this app's to change — the credential
          belongs to somebody else's system — and offering a form that could
          only fail would be worse than saying so.
        */
        <p className="mt-8 rounded-md border border-subtle bg-surface px-3 py-3 text-sm text-fg-muted">
          You are signed in through{" "}
          {identity.source === "cloudflare-access"
            ? "Cloudflare Access"
            : "the local development identity"}
          , which has no password stored here. Sign in with the CMS password to
          change it.
        </p>
      )}
    </div>
  );
});
