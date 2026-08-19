import "server-only";

/**
 * Emails a copy of a contact message to the site owner.
 *
 * ## The database is the record; email is a notification
 *
 * The message is written to D1 **before** this runs, and a failure here never
 * fails the visitor's submission. They filled in a form and it was saved;
 * telling them otherwise because a third-party API was slow would be a lie
 * about what happened, and would invite them to send it again.
 *
 * Everything here therefore logs and returns rather than throwing.
 *
 * ## Unconfigured is a normal state, not an error
 *
 * The site works with no email provider at all — that is the whole point of
 * the inbox. When the environment variables are absent this returns
 * `"skipped"` without logging an error, because a portfolio that has not set
 * up email is not misconfigured.
 *
 * ## Why Resend, and why the HTTP API
 *
 * Cloudflare Workers cannot open raw TCP sockets, so SMTP — Gmail's included
 * — is not available. A provider with an HTTPS API is the only shape that
 * works, and Resend's free tier (3,000/month, 100/day at the time of writing)
 * is far beyond what a portfolio contact form generates. Nothing here is
 * Resend-specific beyond one URL and one payload shape; swapping providers is
 * a change to this file alone.
 *
 * ## Secrets
 *
 * `RESEND_API_KEY` is read from the environment and never logged, never
 * returned, and never sent to the browser. `.env.example` documents the names
 * only. Creating the key is a human action — see `docs/DEPLOYMENT.md`.
 */

export type NotifyResult = "sent" | "skipped" | "failed";

export interface ContactNotification {
  readonly senderName: string;
  readonly senderEmail: string;
  readonly subject: string | null;
  readonly body: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * The plain-text part.
 *
 * Still sent, and still the safe one: a text/plain email cannot execute
 * anything and reads identically in every client. It is the fallback for
 * clients with HTML turned off, and the part a text-only reader sees.
 *
 * An earlier version of this file argued that plain text should be the *only*
 * part, on the grounds that rendering a stranger's words as HTML means
 * escaping them correctly forever. The reasoning was sound and the conclusion
 * was wrong — the escaping is four replacements in one function, and the
 * result was an email that looked like a system log. Both parts are sent now,
 * and the escaping is done in exactly one place.
 */
export function toPlainText(message: ContactNotification): string {
  return [
    `From: ${message.senderName} <${message.senderEmail}>`,
    message.subject ? `Subject: ${message.subject}` : null,
    "",
    message.body,
    "",
    "— Sent from your portfolio contact form. Reply directly to answer.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Escapes text for HTML.
 *
 * The one place a visitor's words are turned into markup, which is what makes
 * the HTML part safe to send. Ampersand first, or the escapes escape each
 * other. Both quote characters, because these values are also interpolated
 * into attributes.
 *
 * `toHtml` and `toPlainText` are exported so this can be tested through them —
 * a stranger's words becoming markup is the one thing in this file that must
 * never regress quietly.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The HTML part.
 *
 * ## Written like it is 2005, deliberately
 *
 * Tables for layout, every style inline, no external stylesheet, no web font
 * and no image. This is not nostalgia — mail clients strip `<style>` blocks,
 * ignore flexbox and grid, block remote images by default, and Outlook still
 * renders through Word. The techniques that make a web page good make an
 * email unreliable.
 *
 * ## No remote anything
 *
 * An image would be blocked until the reader allows it, and allowing it tells
 * the sender the mail was opened. A contact notification has no business
 * tracking its own recipient, and there is nothing here that needs a picture:
 * the monogram is a letter in a coloured box drawn with CSS the clients
 * actually support.
 *
 * ## The message body keeps its shape
 *
 * Escaped first, then newlines become `<br>`. Doing it the other way round
 * would escape the tags that had just been inserted.
 */
export function toHtml(message: ContactNotification): string {
  const name = escapeHtml(message.senderName);
  const email = escapeHtml(message.senderEmail);
  const subject = message.subject ? escapeHtml(message.subject) : null;
  const body = escapeHtml(message.body).replace(/\r?\n/g, "<br>");
  const initial = escapeHtml(
    (message.senderName.trim()[0] ?? "?").toUpperCase(),
  );

  // The preview line clients show beside the subject in a list. Without one
  // they improvise from the first text in the document, which is usually the
  // heading — so every notification would preview identically.
  const preview = escapeHtml(
    `${message.senderName}: ${message.body.replace(/\s+/g, " ").slice(0, 120)}`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Portfolio message</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e6eb;">

<tr>
<td style="padding:24px 28px 20px;border-bottom:1px solid #eef0f3;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding-right:12px;">
<div style="width:40px;height:40px;border-radius:20px;background-color:#1f2937;color:#ffffff;font-size:17px;font-weight:600;line-height:40px;text-align:center;">${initial}</div>
</td>
<td>
<div style="font-size:15px;font-weight:600;color:#111827;">${name}</div>
<div style="font-size:13px;color:#6b7280;padding-top:2px;">
<a href="mailto:${email}" style="color:#6b7280;text-decoration:none;">${email}</a>
</div>
</td>
</tr>
</table>
</td>
</tr>

${
  subject
    ? `<tr>
<td style="padding:20px 28px 0;">
<div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Subject</div>
<div style="font-size:15px;color:#111827;padding-top:4px;">${subject}</div>
</td>
</tr>`
    : ""
}

<tr>
<td style="padding:20px 28px 24px;">
<div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;padding-bottom:8px;">Message</div>
<div style="font-size:15px;line-height:1.6;color:#1f2937;">${body}</div>
</td>
</tr>

<tr>
<td style="padding:0 28px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color:#1f2937;border-radius:8px;">
<a href="mailto:${email}${subject ? `?subject=${encodeURIComponent(`Re: ${message.subject}`)}` : ""}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Reply to ${name}</a>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:16px 28px;border-top:1px solid #eef0f3;background-color:#fafbfc;border-radius:0 0 12px 12px;">
<div style="font-size:12px;line-height:1.5;color:#9ca3af;">
Sent from your portfolio contact form. Replying to this email reaches ${name} directly.
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
 * Send the notification, if email is configured.
 *
 * Never throws. The caller has already saved the message and must not change
 * its answer to the visitor based on what happens here.
 */
export async function notifyOwner(
  message: ContactNotification,
): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_NOTIFY_TO;
  const from = process.env.CONTACT_NOTIFY_FROM;

  // Not configured. A portfolio without email notifications is a supported
  // configuration, so this is silent rather than a warning on every message.
  if (!apiKey || !to || !from) return "skipped";

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
        // Replying in a mail client should reach the sender, not the site.
        reply_to: message.senderEmail,
        subject: message.subject
          ? `Portfolio: ${message.subject}`
          : `Portfolio: message from ${message.senderName}`,
        // Both parts. The client picks: HTML where it can render it, text
        // where it cannot or where the reader has asked for it.
        html: toHtml(message),
        text: toPlainText(message),
      }),
    });

    if (!response.ok) {
      // The body can contain the provider's own diagnostics but never the
      // key, which is only ever sent in a header.
      console.error("[web] contact notification rejected", {
        status: response.status,
      });
      return "failed";
    }

    return "sent";
  } catch (error) {
    console.error("[web] contact notification failed", error);
    return "failed";
  }
}
