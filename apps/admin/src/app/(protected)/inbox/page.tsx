import type { Metadata } from "next";
import Link from "next/link";

import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = {
  title: "Inbox · Portfolio Admin",
};

/** Human-readable timestamp. The stored value stays exact; this is display. */
function formatReceived(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_LABEL: Record<string, string> = {
  unread: "Unread",
  read: "Read",
  archived: "Archived",
  spam: "Spam",
};

export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  // Ordering comes from the repository — newest first, matching the
  // `(status, created_at DESC)` index — and is never re-sorted here.
  const messages = await repos.contactMessages.list();
  const unread = messages.filter((message) => message.status === "unread").length;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Operations
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">
            Inbox
          </h1>
          <p className="mt-3 text-sm text-fg-muted">
            {messages.length === 0
              ? "No messages yet."
              : `${messages.length} message${messages.length === 1 ? "" : "s"}, ${unread} unread. Newest first.`}
          </p>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="mt-10 rounded-md border border-subtle bg-surface p-6 text-sm text-fg-muted">
          Messages sent through the public contact form arrive here. Nothing has
          been received yet.
        </p>
      ) : (
        /* `relative` matters: `sr-only` is absolutely positioned, and an
           absolutely positioned descendant escapes an unpositioned scroll
           container. See docs/DECISIONS.md. */
        <div className="relative mt-8 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <caption className="sr-only">
              Contact messages, newest first
            </caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-medium">
                  From
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Subject
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Received
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className="border-b border-subtle/60">
                  <td className="py-3 pr-4 align-top">
                    {/* Unread is carried by weight as well as the status
                        column, so it is visible while scanning. */}
                    <span
                      className={
                        message.status === "unread"
                          ? "font-semibold text-fg"
                          : "text-fg"
                      }
                    >
                      {message.senderName}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {message.senderEmail}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {message.subject ?? (
                      <span>
                        &mdash;<span className="sr-only">No subject</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {formatReceived(message.createdAt)}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {STATUS_LABEL[message.status] ?? message.status}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Link
                      href={`/inbox/${encodeURIComponent(message.id)}`}
                      className="inline-flex min-h-11 items-center text-accent underline underline-offset-2 transition-colors duration-150 hover:text-fg"
                    >
                      Read
                      <span className="sr-only">
                        {" "}
                        the message from {message.senderName}
                      </span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
