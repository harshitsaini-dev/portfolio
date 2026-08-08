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
 * Plain text, not HTML.
 *
 * The body is text a stranger typed. Rendering it as HTML would mean escaping
 * it correctly forever; a text/plain email cannot execute anything and reads
 * identically in every client.
 */
function toPlainText(message: ContactNotification): string {
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
