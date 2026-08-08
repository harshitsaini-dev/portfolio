/**
 * shadcn/ui Button, adapted to this project's design system.
 *
 * shadcn components are copied in as source and are meant to be owned, so
 * this file is edited rather than treated as vendor code. Re-running
 * `shadcn add button` overwrites it — the four deliberate changes are:
 *
 *   1. **`accent` → `surface-muted`/`fg`.** shadcn's `accent` means a subtle
 *      hover surface; here `--accent` is the brand blue. Left as generated,
 *      hovering an outline or ghost button floods it blue and sets a
 *      `text-accent-foreground` that does not exist. See `shadcn.css`.
 *   2. **`text-white` → `text-destructive-foreground`.** The palette's
 *      danger foreground inverts in dark mode; a hard-coded white does not.
 *   3. **`dark:` variants dropped.** This project does not switch palettes
 *      with a Tailwind variant — `tokens.css` flips the token values under
 *      `prefers-color-scheme`, so every colour below already adapts. Keeping
 *      the generated `dark:` rules would adjust a second time, on top of an
 *      already-adjusted value.
 *   4. **44px default target.** The generated default is `h-9` (36px); the
 *      rest of the admin uses `min-h-11`. The smaller sizes are kept for
 *      dense rows but are below the 44px target and need surrounding space.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

// Relative, not the `@/` alias the shadcn CLI emits. Apps consume this
// package's TypeScript source directly, so a path alias would be resolved
// against the *consuming* app's tsconfig, where `@/` means that app's own
// `src/`. Relative specifiers resolve identically from every consumer.
import { cn } from "../lib/utils.ts";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border border-input bg-background shadow-xs hover:bg-surface-muted hover:text-fg",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-surface-muted hover:text-fg",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
