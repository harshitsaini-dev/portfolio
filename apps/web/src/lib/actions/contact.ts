"use server";

/**
 * The contact form's Server Action — the public site's only write.
 *
 * `lib/db/binding.ts` says this app reads and never writes, and that stayed
 * true until this file. The statement is amended rather than quietly
 * broken: **one** write exists, it appends to `contact_messages`, and it
 * touches no other table. Nothing here updates or deletes anything, and no
 * other public code path writes at all.
 *
 * ## Order of operations
 *
 *   1. Validate the payload. Everything after this point works on parsed
 *      data; nothing reads a raw form field.
 *   2. Reject the cheap abuse — honeypot, then completion time.
 *   3. Write through the repository layer.
 *
 * ## Every rejection looks the same from outside
 *
 * A honeypot hit, a too-fast submission and a malformed email all return the
 * same generic failure. Telling a bot *which* check caught it is telling it
 * how to pass next time, and the honeypot in particular is only worth having
 * while it is invisible. A real visitor who trips one of these is rare — and
 * the message names the field when the failure is an ordinary validation
 * error, which is the case they will actually hit.
 *
 * ## What this is not
 *
 * It is not rate limiting. See `packages/schemas/src/contact.ts`: this
 * project stores no IP address by design, and enforcing a request rate
 * without an identifier belongs at the edge — Cloudflare Rate Limiting and
 * Turnstile, both dashboard configuration and both Phase 21/22.
 */

import { headers } from "next/headers";

import { contactMessageSchema, isTooFast, HONEYPOT_FIELD } from "@portfolio/schemas";

import { getSiteRepositories } from "@/lib/db/binding";
import { notifyOwner } from "@/lib/contact/notify";
// The state shape and the generic message live in a plain module because a
// `"use server"` file may export async functions and nothing else — every
// export becomes a server endpoint. See that file.
import {
  GENERIC_REJECTION,
  type ContactFormState,
} from "./contact-state.ts";

/**
 * The visitor's country, as Cloudflare reports it.
 *
 * The only request metadata stored, and the schema's comment explains why:
 * it is enough to review abuse patterns without retaining anything that
 * identifies a person. Absent outside Cloudflare, including in development,
 * where it is simply null.
 */
async function readSourceCountry(): Promise<string | null> {
  const requestHeaders = await headers();
  const country = requestHeaders.get("cf-ipcountry");
  // Two letters or nothing. A header is caller-controlled in principle, so
  // its shape is checked rather than trusted, and it is never used for a
  // decision — only recorded.
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

export async function sendContactMessageAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const raw = {
    senderName: formData.get("senderName"),
    senderEmail: formData.get("senderEmail"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    [HONEYPOT_FIELD]: formData.get(HONEYPOT_FIELD),
    startedAt: Number(formData.get("startedAt")),
  };

  const parsed = contactMessageSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    let honeypotTripped = false;
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
      if (key === HONEYPOT_FIELD || key === "startedAt") {
        honeypotTripped = true;
        continue;
      }
      (fieldErrors[key] ??= []).push(issue.message);
    }
    // A honeypot hit is reported as a generic failure with no field named,
    // so the response cannot be used to locate the trap.
    if (honeypotTripped || Object.keys(fieldErrors).length === 0) {
      return { status: "error", message: GENERIC_REJECTION };
    }
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  const input = parsed.data;

  if (isTooFast(input.startedAt, Date.now())) {
    return { status: "error", message: GENERIC_REJECTION };
  }

  try {
    const repos = await getSiteRepositories();
    await repos.contactMessages.create({
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      subject: input.subject,
      body: input.body,
      sourceCountry: await readSourceCountry(),
    });
  } catch (error) {
    // The seam's message describes the deployment shape; it belongs in the
    // server log and nowhere near a visitor.
    console.error("[web] contact message failed", error);
    return { status: "error", message: GENERIC_REJECTION };
  }

  // The message is saved. The email is a notification about it, and its
  // outcome deliberately does not change the answer given here: the visitor
  // filled in a form and it was stored, which is true whether or not a
  // third-party API answered. Telling them it failed would invite them to
  // send it again and put two copies in the inbox.
  //
  // Awaited rather than fired and forgotten: a Worker may be torn down as
  // soon as the response is returned, so an unawaited request is one that
  // might never be made.
  await notifyOwner({
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    subject: input.subject,
    body: input.body,
  });

  return { status: "success" };
}
