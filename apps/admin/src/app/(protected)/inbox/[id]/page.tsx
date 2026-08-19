import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";
import { MessageActions } from "@/components/inbox/message-actions";

/**
 * Static and generic — deliberately not `generateMetadata`.
 *
 * A metadata function here would have to read the message to show its
 * subject, and route metadata is evaluated independently of the component, so
 * `withAdminPage` could not protect it. That would leak a stranger's subject
 * line to unauthenticated requests.
 */
export const metadata: Metadata = {
  title: "Message · Portfolio Admin",
};

function formatReceived(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export default withAdminPage<{ params: Promise<{ id: string }> }>(
  async ({ props }) => {
    const { id } = await props.params;
    const repos = await getAdminRepositories();

    const message = await repos.contactMessages.getById(id);
    if (!message) notFound();

    return (
      <div className="mx-auto w-full max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/inbox"
            className="text-fg-muted transition-colors duration-150 hover:text-fg"
          >
            Inbox
          </Link>
          <span aria-hidden="true" className="mx-2 text-fg-muted">
            /
          </span>
          <span className="text-fg">{message.senderName}</span>
        </nav>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-fg">
          {message.subject ?? "No subject"}
        </h1>

        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-fg-muted">
              From
            </dt>
            <dd className="mt-1 text-fg">
              {message.senderName}{" "}
              {/* Whichever routes they left, and both when they left both.
                  The form requires one of the two, so at least one link is
                  always here — the old markup assumed an address and would
                  have rendered `mailto:` pointing at nothing. */}
              {message.senderEmail ? (
                <a
                  href={`mailto:${message.senderEmail}`}
                  className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
                >
                  {message.senderEmail}
                </a>
              ) : null}
              {message.senderEmail && message.senderPhone ? " · " : null}
              {message.senderPhone ? (
                <a
                  href={`https://wa.me/${`${message.senderPhoneCountry ?? ""}${message.senderPhone}`.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
                >
                  {`${message.senderPhoneCountry ?? ""} ${message.senderPhone}`.trim()}
                  <span className="sr-only"> (opens WhatsApp in a new tab)</span>
                </a>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-fg-muted">
              Received
            </dt>
            <dd className="mt-1 text-fg">{formatReceived(message.createdAt)}</dd>
          </div>
          {message.sourceCountry ? (
            <div>
              <dt className="text-xs uppercase tracking-wider text-fg-muted">
                Country
              </dt>
              <dd className="mt-1 text-fg">{message.sourceCountry}</dd>
            </div>
          ) : null}
        </dl>

        {/*
          `whitespace-pre-wrap` renders the sender's line breaks, and rendering
          it as text is the point: this is untrusted input from a stranger, and
          React escapes it. Nothing here interprets it as markup.
        */}
        <div className="mt-10 rounded-lg border border-subtle bg-surface p-6">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
            {message.body}
          </p>
        </div>

        <div className="mt-12">
          <MessageActions messageId={message.id} status={message.status} />
        </div>
      </div>
    );
  },
);
