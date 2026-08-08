/**
 * The contact form's result shape, deliberately *not* in the action file.
 *
 * A `"use server"` module may export async functions and nothing else — every
 * export becomes a callable server endpoint, so a plain object cannot be one.
 * Exporting `contactIdleState` from there failed at runtime with:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * The type alone would have been fine, since types are erased. The constant
 * is what forced the split, and splitting is the right answer rather than
 * inlining the initial state at the call site: the form and the action have
 * to agree on this shape, and one definition is how they keep agreeing.
 */

export type ContactFormState =
  | { readonly status: "idle" }
  | { readonly status: "success" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly fieldErrors?: Readonly<Record<string, string[]>>;
    };

export const contactIdleState: ContactFormState = { status: "idle" };

/**
 * One message for every rejection that is not an ordinary field error.
 *
 * Shared so the action cannot drift from what the form documents: a honeypot
 * hit, a too-fast submission and an infrastructure failure are deliberately
 * indistinguishable to the caller.
 */
export const GENERIC_REJECTION =
  "That message could not be sent. Please try again, or use the email address above.";
