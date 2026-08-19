"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminRepositories } from "../db/binding.ts";
// A `"use server"` file may export only async functions, so the state shape
// and its idle value live next door. See `form-state.ts`.
import type { AuthFormState } from "./form-state.ts";
import {
  fakeVerify,
  hashPassword,
  PASSWORD_ITERATIONS,
  verifyPassword,
} from "./crypto.ts";
import { CODE_TTL_MS, issueCode, verifyCode } from "./codes.ts";
import { sendCodeEmail } from "./email.ts";
import { readSessionIdentity } from "./current-session.ts";
import {
  ACTIVE_TTL_MS,
  issueSession,
  PENDING_TTL_MS,
  RESET_TTL_MS,
  resolveSession,
  sessionCookieName,
} from "./session.ts";
import {
  bucket,
  clearRateLimit,
  consumeRateLimit,
  CODE_ATTEMPT_RULE,
  CODE_REQUEST_RULE,
  LOGIN_EMAIL_RULE,
  LOGIN_IP_RULE,
} from "./rate-limit.ts";

/**
 * Every state transition the login can make.
 *
 * ## What these actions refuse to tell the caller
 *
 * Whether an email address belongs to the administrator. `signIn` answers the
 * same way for an unknown address as for a wrong password, and burns the same
 * time doing it (`fakeVerify`). `requestPasswordReset` answers identically
 * whether or not it sent anything. This is the one place where a helpful error
 * message is a security bug: the address is the only thing an attacker has to
 * guess before they can start guessing passwords.
 *
 * ## Where the rate limits sit
 *
 * Before the work, and counting on every call including refusals — a limiter
 * that stops counting while it is refusing lets an attacker resume the moment
 * the block lifts. Two keys per attempt: the address, so one account cannot be
 * ground through; and the client address, so a list of addresses cannot be
 * tried from one place.
 *
 * ## CSRF
 *
 * Server Actions check the request's `Origin` against the host before this
 * code runs, and the session cookie is `SameSite=Strict`, so a cross-site form
 * post carries no session at all. Neither is relied on alone.
 */

/**
 * The single message every credential failure returns.
 *
 * One string, used for a wrong password, an unknown address and a malformed
 * submission alike. Distinguishing them is precisely the information an
 * attacker wants.
 */
const GENERIC_CREDENTIALS = "That email address and password do not match.";

function fail(message: string): AuthFormState {
  return { status: "error", message };
}

/** The client address, for the second rate-limit key. */
async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  // Cloudflare sets this and strips any inbound copy, so behind this
  // deployment it cannot be spoofed. `unknown` groups everything that arrives
  // without one into a single bucket, which is stricter than letting them
  // through unlimited.
  return requestHeaders.get("cf-connecting-ip")?.trim() || "unknown";
}

async function requestContext() {
  const requestHeaders = await headers();
  return {
    userAgent: requestHeaders.get("user-agent"),
    ip: await clientIp(),
  };
}

/** True when the connection reached us over HTTPS. See `session.ts`. */
async function isSecureRequest(): Promise<boolean> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-proto");
  return forwarded ? forwarded.split(",")[0]!.trim() === "https" : true;
}

async function writeSessionCookie(token: string, maxAgeMs: number) {
  const secure = await isSecureRequest();
  const jar = await cookies();
  jar.set(sessionCookieName(secure), token, {
    httpOnly: true,
    secure,
    // Strict rather than Lax. Nothing links into the admin from anywhere else
    // — there is no emailed link to follow, because codes are typed — so the
    // only thing Lax would buy is a session travelling on a cross-site
    // navigation, which is the thing being prevented.
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

async function clearSessionCookie() {
  const jar = await cookies();
  // Both names: which one was written depends on the scheme at the time, and
  // a stale cookie under the other name would be read on the next request.
  jar.delete(sessionCookieName(true));
  jar.delete(sessionCookieName(false));
}

/** Carries the address between the two halves of a password reset. */
const RESET_EMAIL_COOKIE = "admin_reset_email";

// ---------------------------------------------------------------------------
// Sign in — step one, the password
// ---------------------------------------------------------------------------

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email.length === 0 || password.length === 0) {
    return fail(GENERIC_CREDENTIALS);
  }

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const ip = await clientIp();
  const byIp = await consumeRateLimit(auth, bucket.loginIp(ip), LOGIN_IP_RULE);
  if (!byIp.allowed) {
    return fail(
      `Too many attempts. Try again in ${Math.ceil(byIp.retryAfterSeconds / 60)} minutes.`,
    );
  }
  const byEmail = await consumeRateLimit(
    auth,
    bucket.loginEmail(email),
    LOGIN_EMAIL_RULE,
  );
  if (!byEmail.allowed) {
    return fail(
      `Too many attempts. Try again in ${Math.ceil(byEmail.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const user = await auth.getUserByEmail(email);
  if (!user) {
    // Burns the same time a real verification would. Without this, "no such
    // user" returns in a millisecond and "wrong password" in the hundreds —
    // a difference measurable from the outside, which turns this form into a
    // checker for whether an address is the administrator's.
    await fakeVerify(password);
    return fail(GENERIC_CREDENTIALS);
  }

  const correct = await verifyPassword(password, {
    hash: user.passwordHash,
    salt: user.passwordSalt,
    iterations: user.passwordIterations,
  });
  if (!correct) return fail(GENERIC_CREDENTIALS);

  /*
    Rehash when the cost has moved on.

    The stored iteration count is what a password was created with, and this is
    the only moment the plaintext is in hand to redo it. Silent, and best-effort
    — a failure here must not stop a correct password from signing in.
  */
  if (user.passwordIterations < PASSWORD_ITERATIONS) {
    try {
      const upgraded = await hashPassword(password);
      await auth.setPassword(
        user.id,
        upgraded.hash,
        upgraded.salt,
        upgraded.iterations,
      );
    } catch {
      // Ignored on purpose. See above.
    }
  }

  const context = await requestContext();
  const { token, session } = await issueSession(
    auth,
    user,
    "pending",
    PENDING_TTL_MS,
    context,
  );

  const { code } = await issueCode(auth, user, "login", session.id);
  const sent = await sendCodeEmail(user.email, code, "login", CODE_TTL_MS);
  if (!sent.ok) {
    // The session is destroyed rather than left behind: a pending session with
    // no deliverable code is a dead end that would silently expire.
    await auth.deleteSession(session.id);
    console.error(`[admin] sign-in code not sent: ${sent.reason}`);
    return fail(
      "Your password was correct, but the code could not be emailed. Check the Worker's email configuration.",
    );
  }

  // Only now, so a browser never holds a cookie for a session that failed to
  // become usable.
  await writeSessionCookie(token, PENDING_TTL_MS);
  await clearRateLimit(auth, bucket.loginEmail(email));

  redirect("/login/code");
}

// ---------------------------------------------------------------------------
// Sign in — step two, the code
// ---------------------------------------------------------------------------

export async function verifyLoginCodeAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submitted = String(formData.get("code") ?? "").trim();

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const jar = await cookies();
  const token =
    jar.get(sessionCookieName(true))?.value ??
    jar.get(sessionCookieName(false))?.value ??
    null;

  const lookup = await resolveSession(auth, token, "pending");
  if (!lookup.ok) {
    // Expired, or never existed. Sent back to the start rather than told which,
    // because "your half-finished login expired" and "you have no session" are
    // the same instruction: sign in again.
    await clearSessionCookie();
    redirect("/login?expired=1");
  }

  const attempts = await consumeRateLimit(
    auth,
    bucket.codeAttempt(lookup.user.id),
    CODE_ATTEMPT_RULE,
  );
  if (!attempts.allowed) {
    await auth.deleteSession(lookup.session.id);
    await clearSessionCookie();
    return fail("Too many attempts. Sign in again in half an hour.");
  }

  const check = await verifyCode(auth, lookup.user, "login", submitted);
  if (!check.ok) {
    if (check.reason === "exhausted" || check.reason === "none") {
      await auth.deleteSession(lookup.session.id);
      await clearSessionCookie();
      return fail("That code is no longer usable. Sign in again.");
    }
    if (check.reason === "expired") {
      await auth.deleteSession(lookup.session.id);
      await clearSessionCookie();
      return fail("That code has expired. Sign in again.");
    }
    return fail(
      check.remaining === 1
        ? "That code is not right. One attempt left."
        : `That code is not right. ${check.remaining} attempts left.`,
    );
  }

  const expiresAt = new Date(Date.now() + ACTIVE_TTL_MS).toISOString();
  await auth.setSessionStage(lookup.session.id, "active", expiresAt);
  await auth.markLoggedIn(lookup.user.id);
  await writeSessionCookie(token!, ACTIVE_TTL_MS);
  await clearRateLimit(auth, bucket.codeAttempt(lookup.user.id));

  redirect("/");
}

/** Sends a fresh code for a login already in progress. */
// No parameters: `useActionState` calls this with the previous state and the
// form data, and this action reads neither — everything it needs is in the
// session cookie. A function may ignore trailing arguments, and declaring ones
// it never touches is worse than not declaring them.
export async function resendLoginCodeAction(): Promise<AuthFormState> {
  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const jar = await cookies();
  const token =
    jar.get(sessionCookieName(true))?.value ??
    jar.get(sessionCookieName(false))?.value ??
    null;

  const lookup = await resolveSession(auth, token, "pending");
  if (!lookup.ok) {
    await clearSessionCookie();
    redirect("/login?expired=1");
  }

  const allowed = await consumeRateLimit(
    auth,
    bucket.codeRequest(lookup.user.id),
    CODE_REQUEST_RULE,
  );
  if (!allowed.allowed) {
    return fail(
      `Too many codes requested. Try again in ${Math.ceil(allowed.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const { code } = await issueCode(
    auth,
    lookup.user,
    "login",
    lookup.session.id,
  );
  const sent = await sendCodeEmail(lookup.user.email, code, "login", CODE_TTL_MS);
  if (!sent.ok) {
    console.error(`[admin] resend failed: ${sent.reason}`);
    return fail("The code could not be emailed. Try again shortly.");
  }
  return { status: "idle", message: "A new code is on its way." };
}

// ---------------------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const ip = await clientIp();
  const byIp = await consumeRateLimit(auth, bucket.loginIp(ip), LOGIN_IP_RULE);
  if (!byIp.allowed) {
    return fail(
      `Too many attempts. Try again in ${Math.ceil(byIp.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const user = email.length > 0 ? await auth.getUserByEmail(email) : null;

  /*
    A code is sent only if the account exists, and the answer is the same
    either way.

    The next page asks for the address again along with the code, so nothing
    downstream needs to know whether one was sent. An attacker learns only
    what they already typed.
  */
  if (user) {
    const allowed = await consumeRateLimit(
      auth,
      bucket.codeRequest(user.id),
      CODE_REQUEST_RULE,
    );
    if (allowed.allowed) {
      const { code } = await issueCode(auth, user, "password_reset");
      const sent = await sendCodeEmail(
        user.email,
        code,
        "password_reset",
        CODE_TTL_MS,
      );
      if (!sent.ok) console.error(`[admin] reset code not sent: ${sent.reason}`);
    }
  }

  // The address the visitor typed, kept so the next page does not have to ask
  // for it twice. Not a credential — it is their own input coming back — but
  // HttpOnly anyway, because nothing on this app has a reason to read cookies
  // from script.
  const jar = await cookies();
  jar.set(RESET_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure: await isSecureRequest(),
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(CODE_TTL_MS / 1000),
  });

  redirect("/login/reset");
}

export async function verifyResetCodeAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const submitted = String(formData.get("code") ?? "").trim();

  const jar = await cookies();
  const email = (jar.get(RESET_EMAIL_COOKIE)?.value ?? "").trim().toLowerCase();
  if (email.length === 0) redirect("/login/forgot");

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const ip = await clientIp();
  const byIp = await consumeRateLimit(auth, bucket.loginIp(ip), LOGIN_IP_RULE);
  if (!byIp.allowed) {
    return fail(
      `Too many attempts. Try again in ${Math.ceil(byIp.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const user = await auth.getUserByEmail(email);
  if (!user) {
    // The same refusal a wrong code gets. An unknown address must not be
    // distinguishable here either.
    return fail("That code is not right.");
  }

  const attempts = await consumeRateLimit(
    auth,
    bucket.codeAttempt(user.id),
    CODE_ATTEMPT_RULE,
  );
  if (!attempts.allowed) {
    return fail("Too many attempts. Try again in half an hour.");
  }

  const check = await verifyCode(auth, user, "password_reset", submitted);
  if (!check.ok) {
    if (check.reason === "wrong") {
      return fail(
        check.remaining === 1
          ? "That code is not right. One attempt left."
          : `That code is not right. ${check.remaining} attempts left.`,
      );
    }
    return fail("That code is no longer usable. Ask for a new one.");
  }

  // A ticket that permits exactly one thing: choosing a new password.
  const context = await requestContext();
  const { token } = await issueSession(
    auth,
    user,
    "reset",
    RESET_TTL_MS,
    context,
  );
  await writeSessionCookie(token, RESET_TTL_MS);
  jar.delete(RESET_EMAIL_COOKIE);

  redirect("/login/new-password");
}

/** Rules a new password has to satisfy. */
function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 12) {
    // Length over composition rules. A twelve-character passphrase beats
    // `P@ssw0rd!` on every measure that matters, and character-class rules
    // mostly teach people to put an exclamation mark at the end.
    return "Use at least 12 characters.";
  }
  if (password.length > 200) return "That is longer than 200 characters.";
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

export async function setNewPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return fail(problem);

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const jar = await cookies();
  const token =
    jar.get(sessionCookieName(true))?.value ??
    jar.get(sessionCookieName(false))?.value ??
    null;

  const lookup = await resolveSession(auth, token, "reset");
  if (!lookup.ok) {
    await clearSessionCookie();
    redirect("/login/forgot");
  }

  const hashed = await hashPassword(password);
  await auth.setPassword(
    lookup.user.id,
    hashed.hash,
    hashed.salt,
    hashed.iterations,
  );

  /*
    Everything is logged out, including the browser doing this.

    `setPassword` bumps `password_version`, which invalidates every existing
    session by comparison — this delete is the tidy-up rather than the control.
    Signing in again afterwards is deliberate: somebody resetting a password
    they had lost should end up proving they know the new one.
  */
  await auth.deleteSessionsForUser(lookup.user.id);
  await clearSessionCookie();

  redirect("/login?reset=1");
}

// ---------------------------------------------------------------------------
// Changing a password from inside the admin
// ---------------------------------------------------------------------------

// No parameters, for the reason given on `resendLoginCodeAction`.
export async function requestPasswordChangeCodeAction(): Promise<AuthFormState> {
  const identity = await readSessionIdentity();
  if (!identity) redirect("/login");

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const user = await auth.getUserById(identity.subject);
  if (!user) redirect("/login");

  const allowed = await consumeRateLimit(
    auth,
    bucket.codeRequest(user.id),
    CODE_REQUEST_RULE,
  );
  if (!allowed.allowed) {
    return fail(
      `Too many codes requested. Try again in ${Math.ceil(allowed.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const { code } = await issueCode(auth, user, "password_change");
  const sent = await sendCodeEmail(
    user.email,
    code,
    "password_change",
    CODE_TTL_MS,
  );
  if (!sent.ok) {
    console.error(`[admin] change code not sent: ${sent.reason}`);
    return fail("The code could not be emailed. Try again shortly.");
  }
  return { status: "idle", message: "A code is on its way to your inbox." };
}

export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const submittedCode = String(formData.get("code") ?? "").trim();

  const identity = await readSessionIdentity();
  if (!identity) redirect("/login");

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const user = await auth.getUserById(identity.subject);
  if (!user) redirect("/login");

  const problem = passwordProblem(password, confirm);
  if (problem) return fail(problem);

  /*
    The current password is required even though the session is already
    signed in.

    A session is a machine that was signed in at some point; it is not proof
    that the person at the keyboard right now is the owner. On the one form
    that can replace the credential itself, that difference is the whole
    point — an unattended laptop should not be a way to take the account.
  */
  const correct = await verifyPassword(current, {
    hash: user.passwordHash,
    salt: user.passwordSalt,
    iterations: user.passwordIterations,
  });
  if (!correct) return fail("Your current password is not right.");

  const attempts = await consumeRateLimit(
    auth,
    bucket.codeAttempt(user.id),
    CODE_ATTEMPT_RULE,
  );
  if (!attempts.allowed) {
    return fail("Too many attempts. Try again in half an hour.");
  }

  const check = await verifyCode(auth, user, "password_change", submittedCode);
  if (!check.ok) {
    if (check.reason === "wrong") {
      return fail(
        check.remaining === 1
          ? "That code is not right. One attempt left."
          : `That code is not right. ${check.remaining} attempts left.`,
      );
    }
    return fail("That code is no longer usable. Ask for a new one.");
  }

  const hashed = await hashPassword(password);
  const updated = await auth.setPassword(
    user.id,
    hashed.hash,
    hashed.salt,
    hashed.iterations,
  );

  /*
    Every other browser is signed out; this one is not.

    Changing a password is the thing a person does when they think somebody
    else has it, so the other sessions have to go. Signing the current browser
    out as well would be theatre — it is the one that just proved it knows both
    the old password and the inbox.

    A fresh session, because the old row carries the old `password_version` and
    would be rejected on the very next request.
  */
  await auth.deleteSessionsForUser(user.id);
  const context = await requestContext();
  const { token } = await issueSession(
    auth,
    updated,
    "active",
    ACTIVE_TTL_MS,
    context,
  );
  await writeSessionCookie(token, ACTIVE_TTL_MS);

  return { status: "idle", message: "Your password has been changed." };
}

// ---------------------------------------------------------------------------
// Creating the first administrator
// ---------------------------------------------------------------------------

/**
 * Claims the account, once, while nobody holds it.
 *
 * ## Why this is not a hole
 *
 * A page that creates the administrator sounds like the worst idea in this
 * file, and it would be if it stood alone. Two things make it safe:
 *
 *   1. **It works exactly once.** The moment a user exists it refuses, and the
 *      page that hosts it stops rendering. There is no "second admin".
 *   2. **It is run behind the protection that is still up.** Cloudflare Access
 *      remains in front of this app until the owner takes it down, which they
 *      are told to do only *after* signing in with the password made here. The
 *      window in which this is reachable is a window in which Access is the
 *      thing guarding it.
 *
 * The sequence matters more than the code: create the password behind Access,
 * sign in with it to prove it works, and only then remove Access. Doing it in
 * the other order is how a person locks themselves out of their own CMS.
 */
export async function createFirstAdminAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter the email address the codes should be sent to.");
  }
  const problem = passwordProblem(password, confirm);
  if (problem) return fail(problem);

  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  // Checked again here rather than trusted from the page that rendered the
  // form: the page's check happened at render time, and this is the one that
  // runs at write time.
  if (await auth.hasAnyUser()) {
    return fail("An administrator already exists. Sign in instead.");
  }

  const hashed = await hashPassword(password);
  await auth.createUser({
    email,
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    passwordIterations: hashed.iterations,
  });

  // No session is issued. Signing in immediately is the point — it proves the
  // password works and that the code arrives, which is the whole reason to do
  // this before Access comes down.
  redirect("/login?created=1");
}

// ---------------------------------------------------------------------------
// Signing out
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  const repositories = await getAdminRepositories();
  const auth = repositories.adminAuth;

  const jar = await cookies();
  const token =
    jar.get(sessionCookieName(true))?.value ??
    jar.get(sessionCookieName(false))?.value ??
    null;

  if (token) {
    // Whatever stage it is in. Signing out of a half-finished login is a
    // reasonable thing to want, and leaving the row behind would mean the
    // cookie kept working until it expired.
    const { hashToken } = await import("./crypto.ts");
    await auth.deleteSession(await hashToken(token));
  }
  await clearSessionCookie();
  redirect("/login");
}
