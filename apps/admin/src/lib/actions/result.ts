/**
 * The typed result shape every admin Server Action returns.
 *
 * Small on purpose — four outcomes, distinguished only because the form UI
 * genuinely renders each differently:
 *
 *   success     → redirect or show a confirmation
 *   validation  → show field errors inline, next to the offending inputs
 *   conflict    → show one form-level message ("that slug is taken")
 *   not_found   → the record vanished under the user
 *   failure     → generic apology; details are in the server log only
 *
 * Nothing here ever carries a stack trace, SQL, a constraint string, or a
 * driver message. Those describe schema shape and are logged server-side.
 *
 * Designed so Phase 8 can reuse it verbatim for the remaining entities.
 */

/** Field name → messages. Keys match the form's input `name` attributes. */
export type FieldErrors = Record<string, string[]>;

export type ActionResult<TData = undefined> =
  | { readonly status: "success"; readonly data: TData }
  | {
      readonly status: "validation";
      readonly message: string;
      readonly fieldErrors: FieldErrors;
    }
  | { readonly status: "conflict"; readonly message: string }
  | { readonly status: "not_found"; readonly message: string }
  | { readonly status: "failure"; readonly message: string };

/** The shape a form starts with, before any submission. */
export type ActionState<TData = undefined> = ActionResult<TData> | { readonly status: "idle" };

export const idleState = { status: "idle" } as const;

export function success<TData>(data: TData): ActionResult<TData> {
  return { status: "success", data };
}

export function validationError(
  fieldErrors: FieldErrors,
  message = "Please correct the highlighted fields.",
): ActionResult<never> {
  return { status: "validation", message, fieldErrors };
}

export function conflictError(message: string): ActionResult<never> {
  return { status: "conflict", message };
}

export function notFoundError(
  message = "That project no longer exists.",
): ActionResult<never> {
  return { status: "not_found", message };
}

export function failureError(
  message = "Something went wrong. Please try again.",
): ActionResult<never> {
  return { status: "failure", message };
}

/** True when the result should be announced to the user. */
export function isErrorResult(
  state: ActionState<unknown>,
): state is Extract<ActionResult<unknown>, { status: "validation" | "conflict" | "not_found" | "failure" }> {
  return (
    state.status === "validation" ||
    state.status === "conflict" ||
    state.status === "not_found" ||
    state.status === "failure"
  );
}
