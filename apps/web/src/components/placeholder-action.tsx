import { type ActionVariant, actionClasses } from "@/components/ui/action";
import { type } from "@/components/ui/typography";
import type { PlaceholderLink } from "@/data/types";

interface PlaceholderActionProps {
  action: PlaceholderLink;
  variant?: ActionVariant;
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
 * There are no real destinations yet. Rather than emitting links that go
 * nowhere, an unavailable action renders as a focusable but inert button
 * marked `aria-disabled`, with the reason in visible text wired up via
 * `aria-describedby`. The state is conveyed by wording — not by colour alone
 * — so keyboard and screen-reader users get the same explanation sighted
 * users do.
 */
export function PlaceholderAction({
  action,
  variant = "secondary",
  context,
}: PlaceholderActionProps) {
  if (action.status === "available") {
    return (
      <a className={actionClasses(variant)} href={action.href}>
        {action.label}
      </a>
    );
  }

  const slug = `${context}-${action.label}`.replace(/\W+/g, "-").toLowerCase();
  const reasonId = `action-reason-${slug}`;

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      {/* An unavailable action always takes the secondary appearance,
          whatever variant was requested, and carries no opacity reduction:
          dimming the primary button dropped its label to ~3.6:1, below the
          WCAG AA minimum. A non-functional control should not look like a
          primary CTA anyway. The state is carried by the wording below. */}
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={reasonId}
        className={`${actionClasses("secondary")} cursor-not-allowed`}
      >
        {action.label}
      </button>
      <span id={reasonId} className={type.fine}>
        Not available yet — {action.reason}.
      </span>
    </span>
  );
}
