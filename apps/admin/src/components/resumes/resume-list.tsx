"use client";

import { useActionState, useState } from "react";
import type { MediaAsset, Resume } from "@portfolio/types";

import {
  deleteResumeAction,
  setCurrentResumeAction,
} from "@/lib/actions/resumes";
import { idleState } from "@/lib/actions/result";

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeList({
  resumes,
  mediaAssets,
}: {
  resumes: readonly Resume[];
  mediaAssets: readonly MediaAsset[];
}) {
  const [, deleteAction, isDeletePending] = useActionState(
    deleteResumeAction,
    idleState,
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));

  async function handleSetCurrent(id: string) {
    setUpdatingId(id);
    try {
      await setCurrentResumeAction(id);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="relative mt-8 overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="sr-only">All résumé versions</caption>
        <thead>
          <tr className="border-b border-subtle text-xs uppercase tracking-wider text-fg-muted">
            <th scope="col" className="py-3 pr-4 font-semibold">
              Label / Title
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              Status
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              File Details
            </th>
            <th scope="col" className="py-3 pr-4 font-semibold">
              Created
            </th>
            <th scope="col" className="py-3 font-semibold text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {resumes.map((resume) => {
            const asset = mediaMap.get(resume.mediaAssetId);

            return (
              <tr key={resume.id} className="border-b border-subtle">
                <th scope="row" className="py-3 pr-4 text-sm font-medium text-fg">
                  <div>{resume.label}</div>
                  <div className="font-mono text-xs text-fg-muted">
                    Asset ID: {resume.mediaAssetId}
                  </div>
                </th>
                <td className="py-3 pr-4 text-fg-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    {resume.isCurrent && (
                      <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                        Active Current
                      </span>
                    )}
                    {resume.isVisible ? (
                      <span className="rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg">
                        Visible
                      </span>
                    ) : (
                      <span className="rounded-full border border-subtle bg-surface-muted px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
                        Hidden
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 text-fg-muted">
                  {asset ? (
                    <div>
                      <span className="font-mono text-xs text-fg">
                        {asset.storageKey}
                      </span>
                      <div className="text-xs text-fg-muted">
                        {formatByteSize(asset.byteSize)} · {asset.contentType}
                      </div>
                    </div>
                  ) : (
                    <span className="italic text-fg-muted">Unknown asset</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs text-fg-muted">
                  {new Date(resume.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!resume.isCurrent && (
                      <button
                        type="button"
                        disabled={updatingId === resume.id}
                        onClick={() => handleSetCurrent(resume.id)}
                        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-muted disabled:opacity-50"
                      >
                        {updatingId === resume.id ? "Setting..." : "Make Current"}
                      </button>
                    )}
                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="id" value={resume.id} />
                      <button
                        type="submit"
                        disabled={isDeletePending}
                        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-danger transition-colors duration-150 hover:bg-danger/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
