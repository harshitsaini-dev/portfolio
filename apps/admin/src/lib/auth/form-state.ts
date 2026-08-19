/**
 * The shape every auth form's reply takes.
 *
 * In its own module, not in `actions.ts`, and that is a hard requirement
 * rather than tidiness: a `"use server"` file may export **async functions and
 * nothing else**. A constant beside the actions fails the whole module at
 * import time with "a 'use server' file can only export async functions, found
 * object" — which is how this file came to exist. `apps/web` splits
 * `contact-state.ts` from its contact action for exactly the same reason.
 *
 * No `"use server"` here, and none wanted: this is a type and a frozen value,
 * safe to import from a Client Component.
 */

export interface AuthFormState {
  readonly status: "idle" | "error";
  /** Shown back to the person. Never carries a reason an attacker could use. */
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
}

export const authIdleState: AuthFormState = { status: "idle" };
