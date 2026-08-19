import { AuthForm, CodeField } from "@/components/auth/auth-form";
import { AuthShell, BackToSignIn } from "@/components/auth/auth-shell";
import { verifyResetCodeAction } from "@/lib/auth/actions";

/**
 * Forgotten password, step two.
 *
 * Reached whether or not a code was actually sent — see the previous page. So
 * the wording is careful: it says a code will have arrived *if the address was
 * right*, which is true either way and tells a stranger nothing.
 */
export default function ResetCodePage() {
  return (
    <AuthShell
      title="Enter the code"
      description="If that address has an account, a six-digit code is on its way to it."
      footer={<BackToSignIn />}
    >
      <AuthForm
        action={verifyResetCodeAction}
        submitLabel="Continue"
        pendingLabel="Checking…"
      >
        <CodeField id="code" />
      </AuthForm>
    </AuthShell>
  );
}
