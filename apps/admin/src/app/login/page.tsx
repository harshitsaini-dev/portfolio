import Link from "next/link";

import { AuthField, AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signInAction } from "@/lib/auth/actions";

/**
 * Step one: the password.
 *
 * Outside `(protected)`, so the guard does not run here — a login page behind
 * a login is a redirect loop. It is also the only page in this app that a
 * stranger is ever meant to reach, which is why nothing on it reveals whether
 * an account exists, who owns it, or what went wrong beyond "these do not
 * match".
 *
 * The query flags carry a message across a redirect from somewhere else, and
 * are read rather than trusted: each one maps to a fixed sentence, so a
 * crafted URL can show one of three known strings and nothing else.
 */
/**
 * Declared rather than taken from `PageProps<"/login">`.
 *
 * Next generates its route-literal union during a build, so a type that only
 * resolves after the thing it describes has been built is a poor dependency
 * for the file that creates it — and `pnpm typecheck` runs before any build in
 * CI. The same reasoning as the analytics page; this is the shape Next passes.
 */
interface SignInPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;

  const notice =
    params.created !== undefined
      ? "Your account is ready. Sign in to check that the code arrives."
      : params.reset !== undefined
        ? "Your password has been changed. Sign in with the new one."
        : params.expired !== undefined
          ? "That sign-in attempt expired. Start again."
          : null;

  return (
    <AuthShell
      title="Sign in"
      description="The CMS behind the portfolio."
      footer={
        <Link
          href="/login/forgot"
          className="text-accent underline underline-offset-4 transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Forgotten your password?
        </Link>
      }
    >
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-fg-muted"
        >
          {notice}
        </p>
      ) : null}

      <AuthForm
        action={signInAction}
        submitLabel="Continue"
        pendingLabel="Checking…"
      >
        <AuthField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
        />
        <AuthField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          hint="A six-digit code follows, by email."
        />
      </AuthForm>
    </AuthShell>
  );
}
