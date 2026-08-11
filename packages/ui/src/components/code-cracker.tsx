"use client";

/**
 * Code cracker — the access screen's game.
 *
 * Mastermind with digits: guess a four-digit code, and each guess comes back
 * with how many were in the right place and how many were the right digit in
 * the wrong place. It fits this page exactly — a lock you are trying to open —
 * and it is the only one of the four games with no timer at all, because the
 * screen it sits on is one somebody reached by *failing* to get in.
 *
 * ## It opens nothing
 *
 * Worth saying plainly, because a "code cracker" on an access-denied page
 * invites the question: this is a toy with a random four-digit number in a
 * React state variable. It grants nothing, it is not connected to any check,
 * and the real boundary is Cloudflare Access in front of the Worker. Someone
 * who "wins" gets a line of monospace congratulating them.
 *
 * ## Keyboard is the primary input
 *
 * Digits type, Backspace deletes, Enter submits. The on-screen keypad is for
 * touch and mirrors the same actions — this page is most often reached on a
 * phone, from an email link opened in the wrong browser profile.
 */

import { useCallback, useState } from "react";

const LENGTH = 4;
const MAX_ATTEMPTS = 8;

/** A code with no repeated digits, so the feedback is never ambiguous. */
function makeCode(): string {
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const picked: string[] = [];
  while (picked.length < LENGTH) {
    const index = Math.floor(Math.random() * digits.length);
    const [digit] = digits.splice(index, 1);
    if (digit) picked.push(digit);
  }
  return picked.join("");
}

interface Attempt {
  readonly guess: string;
  /** Right digit, right place. */
  readonly exact: number;
  /** Right digit, wrong place. */
  readonly near: number;
}

function score(code: string, guess: string): Attempt {
  let exact = 0;
  let near = 0;
  for (let i = 0; i < LENGTH; i += 1) {
    const digit = guess[i];
    if (!digit) continue;
    if (digit === code[i]) exact += 1;
    else if (code.includes(digit)) near += 1;
  }
  return { guess, exact, near };
}

export function CodeCracker() {
  const [code, setCode] = useState(makeCode);
  const [entry, setEntry] = useState("");
  const [attempts, setAttempts] = useState<readonly Attempt[]>([]);

  const solved = attempts.some((attempt) => attempt.exact === LENGTH);
  const outOfTries = !solved && attempts.length >= MAX_ATTEMPTS;
  const finished = solved || outOfTries;

  const submit = useCallback(() => {
    if (finished || entry.length !== LENGTH) return;
    setAttempts((current) => [...current, score(code, entry)]);
    setEntry("");
  }, [code, entry, finished]);

  const press = useCallback(
    (digit: string) => {
      if (finished) return;
      setEntry((current) =>
        current.length >= LENGTH ? current : current + digit,
      );
    },
    [finished],
  );

  const reset = useCallback(() => {
    setCode(makeCode());
    setEntry("");
    setAttempts([]);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xs items-baseline justify-between font-mono text-xs text-fg-muted">
        <span>CODE ****</span>
        <span>
          {attempts.length}/{MAX_ATTEMPTS}
        </span>
      </div>

      <p className="max-w-md font-mono text-xs text-fg-muted">
        Four digits, none repeated. ● right place, ○ right digit.
      </p>

      {/* The entry. A real input, so a keyboard reaches it, digits type into
          it and the browser's own editing works — a grid of divs with a
          keydown listener would be a text field that is not one. */}
      <input
        value={entry}
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Enter a ${LENGTH} digit code`}
        onChange={(event) =>
          setEntry(event.target.value.replace(/\D/g, "").slice(0, LENGTH))
        }
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit();
        }}
        disabled={finished}
        className="w-40 rounded-md border border-strong bg-surface px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      />

      {/* The keypad, for touch. `tabIndex={-1}` and hidden from assistive
          technology: the field above is the control, and twelve more tab stops
          that duplicate a keyboard would be twelve stops in the way. */}
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <KeypadButton key={digit} label={digit} onPress={() => press(digit)} />
        ))}
        <KeypadButton
          label="←"
          onPress={() => setEntry((current) => current.slice(0, -1))}
        />
        <KeypadButton label="0" onPress={() => press("0")} />
        <KeypadButton label="↵" onPress={submit} />
      </div>

      {attempts.length > 0 ? (
        <ol className="flex w-full max-w-xs flex-col gap-1 font-mono text-xs">
          {attempts.map((attempt, index) => (
            <li
              key={`${attempt.guess}-${index}`}
              className="flex items-center justify-between rounded-md border border-subtle px-3 py-2"
            >
              <span className="tracking-[0.3em] text-fg">{attempt.guess}</span>
              <span className="text-fg-muted">
                <span className="text-accent">{"●".repeat(attempt.exact)}</span>
                {"○".repeat(attempt.near)}
                {attempt.exact + attempt.near === 0 ? "—" : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p role="status" aria-live="polite" className="font-mono text-xs">
        {solved ? (
          <span className="text-accent">
            CRACKED in {attempts.length} — the real door is still shut.
          </span>
        ) : outOfTries ? (
          <span className="text-fg-muted">OUT OF TRIES — it was {code}.</span>
        ) : (
          <span className="text-fg-muted">Enter to submit.</span>
        )}
      </p>

      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-md border border-subtle px-4 font-mono text-xs text-fg transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {finished ? "NEW CODE" : "GIVE UP"}
      </button>
    </div>
  );
}

function KeypadButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onPress}
      className="size-12 rounded-md border border-subtle font-mono text-sm text-fg-muted transition-colors hover:bg-surface active:bg-surface-muted"
    >
      {label}
    </button>
  );
}
