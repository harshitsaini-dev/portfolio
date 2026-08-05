/**
 * The button/link treatment, defined once.
 *
 * Shared class strings rather than a component, because callers need to
 * render different *elements* (an `<a>` for a real destination, a `<button>`
 * for an inert one) while looking identical. Keeping the styling here means
 * the two paths can never drift apart.
 *
 * `transition-colors duration-150` is the only motion; the global
 * reduced-motion rule in `globals.css` neutralises it.
 */

export type ActionVariant = "primary" | "secondary" | "quiet";

/** min-h-11 = 44px, the practical minimum touch target. */
export const actionBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150";

export const actionVariant: Record<ActionVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent/90",
  secondary:
    "border border-strong bg-surface text-fg hover:bg-surface-muted",
  quiet: "text-fg-muted hover:bg-surface-muted hover:text-fg",
};

export function actionClasses(variant: ActionVariant): string {
  return `${actionBase} ${actionVariant[variant]}`;
}
