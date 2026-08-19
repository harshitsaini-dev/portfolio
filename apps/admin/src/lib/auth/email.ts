import "server-only";

/**
 * Sending the six-digit code.
 *
 * ## Failure is loud here, unlike the contact form
 *
 * `apps/web`'s notifier swallows its errors on purpose: the visitor's message
 * was already saved, so a failed email changes nothing they should be told
 * about. This is the opposite. The code *is* the login — if it does not
 * arrive, the owner is locked out, and reporting success would leave them
 * staring at a box waiting for an email that was never sent. Every failure
 * returns a reason.
 *
 * ## Development has no provider, and says so loudly
 *
 * With nothing configured, a non-production build prints the code to the
 * server console instead of sending it. See the guard below for why that is
 * safe and why the alternative — a login that can only be tested against
 * production — is worse.
 *
 * ## What is never in the email
 *
 * A link. Codes are typed, not clicked, which removes the whole class of
 * problems that come with an emailed credential in a URL: no link to be
 * followed from a machine that is not the one logging in, nothing for a mail
 * scanner to "helpfully" prefetch and consume, and no target for a phishing
 * copy of the same design.
 */

export type SendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** What the code is for, in words the recipient will recognise. */
export type CodeContext = "login" | "password_reset" | "password_change";

const SUBJECTS: Record<CodeContext, string> = {
  login: "Your admin sign-in code",
  password_reset: "Reset your admin password",
  password_change: "Confirm your new admin password",
};

const HEADINGS: Record<CodeContext, string> = {
  login: "Sign in to the CMS",
  password_reset: "Reset your password",
  password_change: "Confirm your password change",
};

const EXPLANATIONS: Record<CodeContext, string> = {
  login: "Enter this code to finish signing in.",
  password_reset: "Enter this code to choose a new password.",
  password_change: "Enter this code to confirm the change.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toPlainText(code: string, context: CodeContext, minutes: number): string {
  return [
    HEADINGS[context],
    "",
    code,
    "",
    `${EXPLANATIONS[context]} It expires in ${minutes} minutes and can be used once.`,
    "",
    "If you did not ask for this, someone knows your password. Change it.",
  ].join("\n");
}

/**
 * The HTML part.
 *
 * Same constraints as the contact notification — tables, inline styles, no
 * remote asset — for the same reasons, and one more that matters here: an
 * email containing a login code has no business loading anything from the
 * network, because a blocked-then-allowed remote image would tell whoever is
 * watching that the code was read.
 *
 * The digits are spaced and monospaced because they are going to be copied by
 * eye onto a keyboard, and `123456` in a proportional font is a worse thing to
 * read back than `123 456`.
 */
function toHtml(code: string, context: CodeContext, minutes: number): string {
  const digits = escapeHtml(`${code.slice(0, 3)} ${code.slice(3)}`);
  const heading = escapeHtml(HEADINGS[context]);
  const explanation = escapeHtml(EXPLANATIONS[context]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${heading} — code expires in ${minutes} minutes</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e6eb;">

<tr>
<td style="padding:28px 28px 8px;">
<div style="font-size:17px;font-weight:600;color:#111827;">${heading}</div>
<div style="font-size:14px;color:#6b7280;padding-top:6px;">${explanation}</div>
</td>
</tr>

<tr>
<td style="padding:20px 28px;">
<div style="background-color:#f4f5f7;border:1px solid #e4e6eb;border-radius:10px;padding:18px;text-align:center;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:0.12em;color:#111827;">${digits}</div>
</td>
</tr>

<tr>
<td style="padding:0 28px 24px;">
<div style="font-size:13px;color:#6b7280;">
Expires in ${minutes} minutes, and works once.
</div>
</td>
</tr>

<tr>
<td style="padding:16px 28px;border-top:1px solid #eef0f3;background-color:#fafbfc;border-radius:0 0 12px 12px;">
<div style="font-size:12px;line-height:1.5;color:#9ca3af;">
If you did not ask for this, somebody has your password. Change it.
</div>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/**
 * Sends a code to the administrator's own address.
 *
 * The recipient is never a parameter from a form — it is read from the stored
 * account. Letting a caller choose would turn the login into a way to send
 * mail from this domain to anywhere.
 */
export async function sendCodeEmail(
  to: string,
  code: string,
  context: CodeContext,
  ttlMs: number,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_NOTIFY_FROM ?? process.env.CONTACT_NOTIFY_FROM;

  if (!apiKey || !from) {
    /*
      With no provider configured, print the code to the server log — and only
      outside production.

      This is the one branch in this file that could be a hole, so the guard is
      the narrowest possible: a production build never reaches it, whatever any
      environment variable says. `NODE_ENV` is fixed at build time by Next, so
      it cannot be flipped by a runtime variable or a Worker setting.

      It exists because the alternative is worse than it looks. Without it the
      login cannot be exercised locally at all, so it would only ever be tested
      against production — and an authentication flow whose failure paths have
      never been walked is one whose failure paths do not work. The code is
      written to the server's own console, which in development is a terminal
      on the developer's machine.
    */
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        [
          "",
          "[admin] no email provider configured - development only.",
          `[admin] ${SUBJECTS[context]} for ${to}: ${code}`,
          "",
        ].join("\n"),
      );
      return { ok: true };
    }

    // Named precisely, because the person reading this log is the one who has
    // to go and set them — and because "email failed" would send them looking
    // at Resend instead of at their own Worker configuration.
    return {
      ok: false,
      reason: !apiKey
        ? "RESEND_API_KEY is not set on this Worker"
        : "ADMIN_NOTIFY_FROM (or CONTACT_NOTIFY_FROM) is not set on this Worker",
    };
  }

  const minutes = Math.round(ttlMs / 60_000);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: SUBJECTS[context],
        html: toHtml(code, context, minutes),
        text: toPlainText(code, context, minutes),
      }),
    });

    if (!response.ok) {
      // The status only. A provider's error body can echo the payload, and
      // the payload contains the code.
      return { ok: false, reason: `email provider returned ${response.status}` };
    }
    return { ok: true };
  } catch {
    // The error is not included: a fetch failure can carry the request in its
    // message, and the request has the code in it.
    return { ok: false, reason: "the email could not be sent" };
  }
}
