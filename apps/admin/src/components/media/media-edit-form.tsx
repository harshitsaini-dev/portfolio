"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { MediaAsset } from "@portfolio/types";

import {
  deleteMediaAssetAction,
  updateMediaAssetAction,
} from "@/lib/actions/media";
import {
  idleState,
  isErrorResult,
} from "@/lib/actions/result";
import { TextAreaField } from "@/components/form/field";

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaEditForm({ asset }: { asset: MediaAsset }) {
  const fieldId = useId();
  const [updateState, updateAction, isUpdatePending] = useActionState(
    updateMediaAssetAction,
    idleState,
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState(
    deleteMediaAssetAction,
    idleState,
  );

  const [altText, setAltText] = useState(asset.altText ?? "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const activeState = isErrorResult(deleteState) ? deleteState : updateState;
  const errorMessage = isErrorResult(activeState) ? activeState.message : null;
  const fieldErrors = updateState.status === "validation" ? updateState.fieldErrors : {};

  useEffect(() => {
    if (isErrorResult(activeState)) summaryRef.current?.focus();
  }, [activeState]);

  useEffect(() => {
    if (isConfirmingDelete) confirmButtonRef.current?.focus();
  }, [isConfirmingDelete]);

  const updatePayload = JSON.stringify({
    altText,
  });

  return (
    <div className="mt-8 flex flex-col gap-10 max-w-2xl">
      <div
        ref={summaryRef}
        tabIndex={-1}
        role={errorMessage ? "alert" : undefined}
        className={
          errorMessage
            ? "rounded-md border border-danger bg-surface p-4 text-sm text-fg"
            : "sr-only"
        }
      >
        {errorMessage ? (
          <>
            <strong className="font-semibold text-danger">
              {activeState.status === "conflict" ? "In Use / Conflict" : "Operation Failed"}
            </strong>
            <p className="mt-1 text-fg-muted">{errorMessage}</p>
          </>
        ) : null}
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-subtle bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted">
          Asset Metadata (Read-only)
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-fg-muted">ID</dt>
            <dd className="font-mono text-xs text-fg mt-0.5">{asset.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Storage Key</dt>
            <dd className="font-mono text-xs text-fg mt-0.5">{asset.storageKey}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Content Type</dt>
            <dd className="text-fg mt-0.5">{asset.contentType}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">File Size</dt>
            <dd className="text-fg mt-0.5">{formatByteSize(asset.byteSize)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Dimensions</dt>
            <dd className="text-fg mt-0.5">
              {asset.width && asset.height ? `${asset.width} × ${asset.height} px` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Uploaded</dt>
            <dd className="text-fg mt-0.5">{new Date(asset.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <form action={updateAction} className="flex flex-col gap-6">
        <input type="hidden" name="id" value={asset.id} />
        <input type="hidden" name="payload" value={updatePayload} />

        <TextAreaField
          id={`${fieldId}-altText`}
          name="altText"
          label="Alt Text / Description"
          rows={3}
          value={altText}
          errors={fieldErrors.altText}
          hint="Descriptive text for accessibility. Required for portfolio images."
          onChange={setAltText}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isUpdatePending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isUpdatePending ? "Saving…" : "Save changes"}
          </button>
          <Link
            href="/media"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
          >
            Cancel
          </Link>
        </div>
      </form>

      <hr className="border-subtle" />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
          Danger Zone
        </h2>
        <p className="text-sm text-fg-muted">
          Permanently delete this media asset. Deletion will be refused if this asset is currently referenced by a project or résumé.
        </p>

        {isConfirmingDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/5 p-4">
            <input type="hidden" name="id" value={asset.id} />
            <p className="w-full text-xs font-semibold text-danger">
              Are you sure? This action cannot be undone.
            </p>
            <button
              ref={confirmButtonRef}
              type="submit"
              disabled={isDeletePending}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-danger/90 disabled:opacity-70"
            >
              {isDeletePending ? "Deleting…" : "Confirm Delete"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger/40 bg-surface px-4 text-sm font-medium text-danger transition-colors duration-150 hover:bg-danger/10"
            >
              Delete media asset
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
