import type { PlaceholderLink } from "@/data/types";

type Variant = "primary" | "secondary";

const baseClasses =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:opacity-90",
  secondary: "border border-border bg-surface text-foreground hover:bg-border/40",
};

interface PlaceholderActionProps {
  action: PlaceholderLink;
  variant?: Variant;
  /**
   * Disambiguates the generated `aria-describedby` id. The same action can
   * appear more than once on the page (e.g. the contact CTA in both the hero
   * and the contact section), and duplicate ids would be invalid HTML and
   * break the association for assistive technology.
   */
  context: string;
}

/**
 * Renders a call-to-action honestly.
 *
 * Phase 2 has no real destinations. Rather than emitting links that go
 * nowhere, an unavailable action renders as a focusable but inert button
 * marked `aria-disabled`, with the reason stated in visible text and wired
 * up via `aria-describedby`. The unavailable state is therefore conveyed by
 * wording — not by colour alone — and keyboard and screen-reader users get
 * the same explanation sighted users do.
 */
export function PlaceholderAction({
  action,
  variant = "secondary",
  context,
}: PlaceholderActionProps) {
  const className = `${baseClasses} ${variantClasses[variant]}`;

  if (action.status === "available") {
    return (
      <a className={className} href={action.href}>
        {action.label}
      </a>
    );
  }

  const slug = `${context}-${action.label}`.replace(/\W+/g, "-").toLowerCase();
  const reasonId = `action-reason-${slug}`;

  return (
    <span className="inline-flex flex-col gap-1">
      {/* An unavailable action always uses the secondary appearance,
          regardless of the requested variant, and carries no opacity
          reduction: dimming the primary button dropped its label to roughly
          3.6:1 against the blended background, below the WCAG AA minimum.
          The unavailable state is carried by the wording below instead. */}
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={reasonId}
        className={`${baseClasses} ${variantClasses.secondary} cursor-not-allowed`}
      >
        {action.label}
      </button>
      <span id={reasonId} className="text-xs text-muted">
        Not available yet — {action.reason}.
      </span>
    </span>
  );
}
