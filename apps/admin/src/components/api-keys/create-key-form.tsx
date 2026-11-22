"use client";

/**
 * Creating an API key, and showing it the one time it can be shown.
 *
 * After a successful create the form is replaced by the key itself, with a
 * copy button and a plain statement that it will not be shown again — the
 * server stores only its hash, so "show it again" is not something any later
 * page could do.
 */

import { useActionState, useState } from "react";

import { API_KEY_SCOPES, type ApiKeyScope } from "@portfolio/types";

import { createApiKeyAction } from "@/lib/actions/api-keys";
import { idleState, isErrorResult } from "@/lib/actions/result";
import { TextField } from "@/components/form/field";

const SCOPE_TEXT: Record<ApiKeyScope, { label: string; hint: string }> = {
  read: { label: "Read", hint: "Read all content (not the inbox)." },
  write: {
    label: "Write",
    hint: "Create, update and delete content. Does not include read.",
  },
  inbox: {
    label: "Inbox",
    hint: "Read and manage contact messages: other people's personal data.",
  },
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "", label: "Never" },
] as const;

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70";
const quietButton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-strong bg-surface px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted";

export function CreateKeyForm() {
  const [state, formAction, isPending] = useActionState(
    createApiKeyAction,
    idleState,
  );
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};

  if (state.status === "success" && dismissed !== state.data.key) {
    const { key } = state.data;
    return (
      <section
        aria-labelledby="new-key-heading"
        className="rounded-lg border border-accent/50 bg-surface p-6"
      >
        <h2 id="new-key-heading" className="text-base font-semibold text-fg">
          Key created: {state.data.name}
        </h2>
        <p role="status" className="mt-2 text-sm text-fg-muted">
          Copy it now. It is stored only as a hash and{" "}
          <strong>cannot be shown again</strong>.
        </p>
        <label htmlFor="new-key-value" className="sr-only">
          The new API key
        </label>
        <input
          id="new-key-value"
          readOnly
          value={key}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-4 w-full rounded-md border border-strong bg-surface-muted px-3 py-2 font-mono text-sm text-fg"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={primaryButton}
            onClick={async () => {
              await navigator.clipboard.writeText(key);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <button
            type="button"
            className={quietButton}
            onClick={() => {
              setDismissed(key);
              setCopied(false);
              setName("");
            }}
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border border-subtle bg-surface p-6"
    >
      <h2 className="text-base font-semibold text-fg">New key</h2>

      <TextField
        id="api-key-name"
        name="name"
        label="Name"
        hint="Where it will be used, for example: blog build, or agent on laptop."
        value={name}
        onChange={setName}
        errors={fieldErrors.name}
        required
      />

      <fieldset
        aria-describedby={fieldErrors.scopes ? "api-key-scopes-error" : undefined}
      >
        <legend className="text-sm font-medium text-fg">Permissions</legend>
        <div className="mt-2 flex flex-col gap-2">
          {API_KEY_SCOPES.map((scope) => (
            <label key={scope} className="flex items-start gap-3 text-sm text-fg">
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                defaultChecked={scope === "read"}
                className="mt-1 size-4 accent-accent"
              />
              <span>
                <span className="font-medium">{SCOPE_TEXT[scope].label}</span>
                <span className="block text-xs text-fg-muted">
                  {SCOPE_TEXT[scope].hint}
                </span>
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.scopes ? (
          <p
            id="api-key-scopes-error"
            className="mt-2 text-xs font-medium text-danger"
          >
            {fieldErrors.scopes.join(" ")}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="api-key-expiry" className="text-sm font-medium text-fg">
          Expires after
        </label>
        <select
          id="api-key-expiry"
          name="expiresInDays"
          defaultValue="90"
          className="mt-1 block w-full rounded-md border border-strong bg-surface px-3 py-2 text-sm text-fg"
        >
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isErrorResult(state) && state.status !== "validation" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.message}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={isPending} className={primaryButton}>
          {isPending ? "Creating…" : "Create key"}
        </button>
      </div>
    </form>
  );
}
