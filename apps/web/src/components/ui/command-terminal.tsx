"use client";

/**
 * A terminal the visitor can actually type into.
 *
 * The hero's console already prints a script at people; this lets them answer.
 * Same visual language, different contract: that one is decoration and hidden
 * from assistive technology, this one is a control and is not.
 *
 * ## It is an enhancement, never the only way through
 *
 * Every command here shows something that is already on the page or one link
 * away. Someone who never finds it, cannot use a keyboard comfortably, or has
 * JavaScript off loses nothing — which is the rule that makes a gimmick like
 * this defensible on a site whose job is to be read.
 *
 * ## Accessibility is the whole design, not a pass afterwards
 *
 * - The input is a real `<input>` with a real `<label>`, so it is reachable by
 *   tab and announced as what it is.
 * - Output is a `role="log"` with `aria-live="polite"`: each response is
 *   announced once, after it lands, without interrupting.
 * - Nothing is trapped. `Escape` blurs, and no key is swallowed except the ones
 *   the terminal genuinely owns (Enter, ↑/↓ for history, Tab to complete) — and
 *   Tab only when there is a completion, so tabbing out still works.
 *
 * ## Content comes from props
 *
 * Everything printed is passed in from the server, from the CMS. No command
 * hardcodes a fact about the person: an editor who renames a skill renames it
 * here too.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface TerminalData {
  readonly name: string;
  readonly role: string;
  readonly tagline: string;
  readonly location: string;
  readonly skills: readonly { readonly name: string; readonly items: readonly string[] }[];
  readonly projects: readonly { readonly title: string; readonly slug: string; readonly year: string }[];
  readonly socials: readonly { readonly label: string; readonly url: string }[];
  readonly resumeHref: string | null;
}

interface Line {
  readonly id: number;
  /** `in` echoes what was typed; `out` is the response. */
  readonly kind: "in" | "out" | "error";
  readonly text: string;
  /** Rendered after the text, when a response points somewhere. */
  readonly href?: string;
  readonly hrefLabel?: string;
}

const PROMPT = "visitor@portfolio:~$";

export function CommandTerminal({
  data,
  fullPage = false,
  footer,
}: {
  data: TerminalData;
  /**
   * Fills its container instead of capping the log at a fixed height. Used by
   * `/terminal`, where the terminal *is* the page and a short scrolling box
   * inside a tall empty screen would be the wrong shape.
   */
  fullPage?: boolean;
  /** Rendered under the input — the way back to the normal site. */
  footer?: ReactNode;
}) {
  const [lines, setLines] = useState<readonly Line[]>([]);
  const [value, setValue] = useState("");
  /** Newest first. Walked with the arrow keys, like a real shell. */
  const [history, setHistory] = useState<readonly string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const nextId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(
    () => ({
      help: () => [
        "Available commands:",
        "  whoami      who this is",
        "  skills      what I work with",
        "  projects    what I have built",
        "  notes       things I have written",
        "  contact     how to reach me",
        "  resume      the printable version",
        "  clear       wipe the screen",
      ],
      whoami: () =>
        [
          data.name,
          data.role,
          data.tagline,
          data.location ? `Based in ${data.location}.` : "",
          // The route is the easter egg; printing it here is how someone who
          // types the command rather than guessing URLs still finds it.
          "  →  /whoami",
        ].filter(Boolean),
      skills: () =>
        data.skills.length === 0
          ? ["Nothing listed yet."]
          : data.skills.flatMap((group) => [
              `${group.name}:`,
              `  ${group.items.join(", ") || "—"}`,
            ]),
      projects: () =>
        data.projects.length === 0
          ? ["Nothing published yet."]
          : data.projects.map((p) => `  ${p.year}  ${p.title}  →  /projects/${p.slug}`),
      notes: () => ["Short posts about building things.", "  →  /notes"],
      contact: () =>
        data.socials.length === 0
          ? ["Nothing listed yet."]
          : data.socials.map((s) => `  ${s.label.padEnd(12)} ${s.url}`),
      resume: () =>
        data.resumeHref
          ? ["A printable résumé, straight from the CMS.", "  →  /resume"]
          : ["  →  /resume"],
    }),
    [data],
  );

  const names = useMemo(() => [...Object.keys(commands), "clear"].sort(), [commands]);

  // The greeting is written on mount rather than as initial state: it mentions
  // `help`, and a visitor who has not seen the greeting has no way to guess it.
  useEffect(() => {
    setLines([
      { id: nextId.current++, kind: "out", text: `${data.name} — type a command. Try \`help\`.` },
    ]);
  }, [data.name]);

  // Keeps the newest line in view. `scrollTop` on the log alone, never
  // `scrollIntoView`, which would drag the whole page to the terminal while
  // someone is reading something else.
  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  function push(entries: readonly Omit<Line, "id">[]) {
    setLines((current) => [
      ...current,
      ...entries.map((entry) => ({ ...entry, id: nextId.current++ })),
    ]);
  }

  function run(raw: string) {
    const input = raw.trim();
    if (input === "") return;

    setHistory((current) => [input, ...current].slice(0, 50));
    setHistoryIndex(-1);
    push([{ kind: "in", text: input }]);

    // Only the first word is the command. Arguments are accepted and ignored,
    // so `skills --list` does what someone typing it plainly expects.
    const name = input.split(/\s+/)[0]?.toLowerCase() ?? "";

    if (name === "clear") {
      setLines([]);
      return;
    }
    if (name === "sudo") {
      push([{ kind: "out", text: "Nice try. You already have everything — it is all on this page." }]);
      return;
    }

    const command = commands[name as keyof typeof commands];
    if (!command) {
      push([
        {
          kind: "error",
          text: `command not found: ${name}. Type \`help\` for the list.`,
        },
      ]);
      return;
    }

    push(
      command().map((text) => {
        // A response line ending in an arrow and a path becomes a real link, so
        // the terminal never dead-ends at a route the visitor has to retype.
        const match = /^\s*→\s{2}(\/\S+)$/.exec(text);
        return match
          ? { kind: "out" as const, text: "", href: match[1], hrefLabel: match[1] }
          : { kind: "out" as const, text };
      }),
    );
  }

  return (
    <div
      className={`flex flex-col rounded-lg border border-subtle bg-surface font-mono text-sm ${
        fullPage ? "h-full" : ""
      }`}
    >
      <div aria-hidden="true" className="flex gap-1.5 border-b border-subtle px-4 py-3">
        <span className="size-2.5 rounded-full bg-danger/70" />
        <span className="size-2.5 rounded-full bg-fg-muted/40" />
        <span className="size-2.5 rounded-full bg-accent/70" />
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        className={`overflow-y-auto px-4 py-3 ${
          fullPage ? "flex-1" : "max-h-80"
        }`}
      >
        {lines.map((line) => (
          <p
            key={line.id}
            className={`whitespace-pre-wrap break-words ${
              line.kind === "in"
                ? "text-fg"
                : line.kind === "error"
                  ? "text-danger"
                  : "text-fg-muted"
            }`}
          >
            {line.kind === "in" ? (
              <>
                <span aria-hidden="true" className="select-none text-accent">
                  {PROMPT}{" "}
                </span>
                {line.text}
              </>
            ) : line.href ? (
              <Link
                href={line.href}
                className="text-accent underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {line.hrefLabel}
              </Link>
            ) : (
              line.text
            )}
          </p>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(value);
          setValue("");
        }}
        className="flex items-center gap-2 border-t border-subtle px-4 py-3"
      >
        <label htmlFor="terminal-input" className="sr-only">
          Type a command. Try help.
        </label>
        <span aria-hidden="true" className="select-none text-accent">
          {PROMPT}
        </span>
        <input
          id="terminal-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
              return;
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              if (history.length === 0) return;
              event.preventDefault();
              const next =
                event.key === "ArrowUp"
                  ? Math.min(historyIndex + 1, history.length - 1)
                  : Math.max(historyIndex - 1, -1);
              setHistoryIndex(next);
              setValue(next === -1 ? "" : (history[next] ?? ""));
              return;
            }
            if (event.key === "Tab") {
              const prefix = value.trim().toLowerCase();
              const match = names.find((name) => name.startsWith(prefix) && prefix !== "");
              // Only swallowed when there is something to complete — otherwise
              // Tab must keep moving focus out of the terminal.
              if (match) {
                event.preventDefault();
                setValue(match);
              }
            }
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="help"
          className="peer min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted/60"
        />
        {/*
          A block caret, for the look of the thing. The input has its own
          native caret, so this is decoration and is hidden from assistive
          technology; it sits after the field and only while the field is
          focused, via `peer-focus`, so it never implies a cursor that is not
          there. The blink is a CSS animation and stops under reduced motion.
        */}
        <span aria-hidden="true" className="terminal-caret hidden peer-focus:inline-block" />
      </form>

      {footer ? (
        <div className="border-t border-subtle px-4 py-3 text-xs">{footer}</div>
      ) : null}
    </div>
  );
}
