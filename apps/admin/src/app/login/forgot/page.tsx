import { AuthField, AuthForm } from "@/components/auth/auth-form";
import { AuthShell, BackToSignIn } from "@/components/auth/auth-shell";
import { requestPasswordResetAction } from "@/lib/auth/actions";

/**
 * Forgotten password, step one.
 *
 * The next page is reached whether or not the address matched anything. That
 * is the whole design: an honest "no account with that address" here would
 * hand an attacker the one fact they need before they can start guessing
 * passwords, and this form is open to the internet.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgotten password"
      footer={<BackToSignIn />}
    >
      <AuthForm
        action={requestPasswordResetAction}
        submitLabel="Send a code"
        pendingLabel="Sending…"
      >
        <AuthField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
        />
      </AuthForm>
    </AuthShell>
  );
}
