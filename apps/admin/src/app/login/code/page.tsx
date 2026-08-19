import { AuthForm, CodeField } from "@/components/auth/auth-form";
import { AuthShell, BackToSignIn } from "@/components/auth/auth-shell";
import { verifyLoginCodeAction } from "@/lib/auth/actions";
import { ResendCode } from "@/components/auth/resend-code";

/**
 * Step two: the code.
 *
 * The page renders without checking for a pending session, deliberately. The
 * check belongs where it can be trusted — in the action, on submit — and doing
 * it here as well would mean a redirect on every render for anybody who let
 * the page sit, which is exactly when they are about to type the code they
 * have just gone to fetch.
 */
export default function LoginCodePage() {
  return (
    <AuthShell
      title="Check your email"
      // Kept, unlike the decoration elsewhere: the expiry and the single use
      // are things somebody needs to know before they go and fetch the code.
      description="It expires in ten minutes and works once."
      footer={<BackToSignIn />}
    >
      <AuthForm
        action={verifyLoginCodeAction}
        submitLabel="Sign in"
        pendingLabel="Checking…"
      >
        <CodeField id="code" />
      </AuthForm>

      <div className="mt-4">
        <ResendCode />
      </div>
    </AuthShell>
  );
}
