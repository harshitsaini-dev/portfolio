import type { Metadata } from "next";

import { CreateKeyForm } from "@/components/api-keys/create-key-form";
import { KeyActions } from "@/components/api-keys/key-actions";
import { withAdminPage } from "@/lib/auth/protected-page";
import { getAdminRepositories } from "@/lib/db/binding";

export const metadata: Metadata = {
  title: "API keys · Portfolio Admin",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusOf(
  key: { revokedAt: string | null; expiresAt: string | null },
  now: number,
): string {
  if (key.revokedAt) return "Revoked";
  if (key.expiresAt && Date.parse(key.expiresAt) <= now) return "Expired";
  return "Active";
}

/**
 * Keys for the REST API at `/api/v1`.
 *
 * The page never sees a key: the list is prefixes and metadata, and the only
 * full key ever rendered is the one the create action has just returned.
 */
export default withAdminPage(async () => {
  const repos = await getAdminRepositories();
  const keys = await repos.apiKeys.list();
  const now = new Date().getTime();

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Operations
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">API keys</h1>
      <p className="mt-3 max-w-2xl text-sm text-fg-muted">
        Keys let your other projects, scripts and AI agents read and write this
        CMS through the REST API at <code className="font-mono">/api/v1</code>.
        The full reference, every endpoint and field, is public at{" "}
        <a
          href="/api/v1/openapi.json"
          className="font-medium text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          /api/v1/openapi.json
        </a>
        . Send a key as{" "}
        <code className="font-mono">Authorization: Bearer pfk_…</code>.
      </p>

      <div className="mt-8">
        <CreateKeyForm />
      </div>

      <h2 className="mt-12 text-lg font-semibold text-fg">Existing keys</h2>
      {keys.length === 0 ? (
        <p className="mt-4 rounded-md border border-subtle bg-surface p-6 text-sm text-fg-muted">
          No keys yet.
        </p>
      ) : (
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <caption className="sr-only">API keys, newest first</caption>
            <thead>
              <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-medium">Name</th>
                <th scope="col" className="py-3 pr-4 font-medium">Permissions</th>
                <th scope="col" className="py-3 pr-4 font-medium">Status</th>
                <th scope="col" className="py-3 pr-4 font-medium">Expires</th>
                <th scope="col" className="py-3 pr-4 font-medium">Last used</th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-subtle/60">
                  <td className="py-3 pr-4 align-top">
                    <span className="font-medium text-fg">{key.name}</span>
                    <span className="block font-mono text-xs text-fg-muted">
                      {key.prefix}…
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {key.scopes.join(", ")}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {statusOf(key, now)}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                  </td>
                  <td className="py-3 pr-4 align-top text-fg-muted">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <KeyActions
                      id={key.id}
                      name={key.name}
                      revoked={key.revokedAt !== null}
                    />
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
