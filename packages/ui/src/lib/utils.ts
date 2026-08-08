/**
 * The class-name helper every shadcn component imports.
 *
 * Two jobs, and the second is the reason it cannot just be `clsx`:
 *
 *   1. `clsx` flattens conditional class arguments into a string.
 *   2. `twMerge` resolves *conflicts* within that string, last-wins. Without
 *      it, `cn("px-4", "px-2")` emits both and the winner is decided by the
 *      order Tailwind happened to generate the rules in — not by the caller.
 *      Every shadcn component takes a `className` prop intended to override
 *      its defaults, so that resolution is the whole point of the prop.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
