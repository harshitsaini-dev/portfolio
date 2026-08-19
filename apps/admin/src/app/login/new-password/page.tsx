import { AuthField, AuthForm } from "@/components/auth/auth-form";
import { AuthShell, BackToSignIn } from "@/components/auth/auth-shell";
import { setNewPasswordAction } from "@/lib/auth/actions";

/**
 * Forgotten password, step three.
 *
 * Permitted only by a `reset` session — a ticket the previous step issues,
 * which authorises this one thing and expires in ten minutes. The action
 * checks for it; this page does not, for the same reason the code page does
 * not: the render is not where a permission can be trusted.
 */
export default function NewPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      description="Every signed-in browser will be signed out, including this one."
      footer={<BackToSignIn />}
    >
      <AuthForm
        action={setNewPasswordAction}
        submitLabel="Save password"
        pendingLabel="Saving…"
      >
        <AuthField
          id="password"
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters. Length beats punctuation."
          autoFocus
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
