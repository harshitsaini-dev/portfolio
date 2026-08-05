import type { ElementType, ReactNode } from "react";

type Tone = "raised" | "muted" | "outline";

const toneClasses: Record<Tone, string> = {
  /** Default card: elevated fill, hairline border, minimal shadow. */
  raised: "bg-surface border border-subtle shadow-sm",
  /** Recessed panel, used to group without competing with cards. */
  muted: "bg-surface-muted border border-subtle",
  /** No fill — structure carried by the border alone. */
  outline: "border border-subtle",
};

interface SurfaceProps {
  children: ReactNode;
  tone?: Tone;
  /** Rendered element. Defaults to a plain div; pass `article`/`li` etc. */
  as?: ElementType;
  padded?: boolean;
  className?: string;
  "aria-labelledby"?: string;
}

/**
 * The single card/panel treatment.
 *
 * Every raised area on the page goes through this component so fill, border,
 * radius, and shadow stay consistent. Depth is deliberately shallow — one
 * hairline border plus a barely-there shadow — because stacking heavier
 * shadows is what makes a professional layout start to look like a dashboard
 * demo.
 */
export function Surface({
  children,
  tone = "raised",
  as: Component = "div",
  padded = true,
  className = "",
  ...rest
}: SurfaceProps) {
  return (
    <Component
      className={`rounded-lg ${toneClasses[tone]} ${padded ? "p-5 sm:p-6" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
