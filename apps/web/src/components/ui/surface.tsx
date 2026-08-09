import type { ReactNode } from "react";

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
  /**
   * Translucent fill with a backdrop blur.
   *
   * Opt-in rather than the default: glass is for panels that sit over
   * something worth seeing through to — the 3D figure passes behind the page
   * — and a panel over flat background gains nothing from it but cost.
   */
  glass?: boolean;
  /**
   * React to hover and keyboard focus with the shared glow.
   *
   * Also opt-in. A panel that lights up without being interactive promises
   * something it cannot deliver, so this belongs to cards you can click into,
   * not to every surface.
   */
  interactive?: boolean;
  /** Rendered element. Defaults to a plain div; pass `article`/`li` etc. */
  /**
   * Rendered element. Defaults to a plain div; pass `article`/`li` etc.
   *
   * Typed as the HTML element names rather than `ElementType`. Installing
   * `@react-three/fiber` augments `JSX.IntrinsicElements` with every Three.js
   * object, and a bare `ElementType` then resolves to that union too — which
   * made TypeScript infer `children: never` here, because a `<mesh>` and a
   * `<div>` do not agree on what children are. Naming the elements this
   * component is actually used as keeps the inference to HTML.
   */
  as?: keyof React.JSX.IntrinsicElements & ("div" | "article" | "li" | "section" | "aside");
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
  glass = false,
  interactive = false,
  className = "",
  ...rest
}: SurfaceProps) {
  return (
    <Component
      /*
        `glass` is listed after the tone so its translucent fill wins over the
        tone's solid one. Both are plain classes, so this depends on Tailwind's
        stylesheet order rather than the attribute order — which is why the
        glass fill is a custom property rather than a `bg-*` utility: it is
        applied by a rule of our own and cannot be beaten by a sibling
        background utility.
      */
      className={`rounded-lg ${toneClasses[tone]} ${glass ? "glass glass-edge" : ""} ${interactive ? "glow-hover" : ""} ${padded ? "p-5 sm:p-6" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
