import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";

/**
 * The account controls in the header: change password, and sign out.
 *
 * Two plain controls rather than a dropdown. A menu would be a client
 * component holding open/closed state, a focus trap and an outside-click
 * handler, for two links that fit side by side — and the version with no
 * JavaScript is a form and an anchor that already work.
 *
 * Sign-out is a form, not a link. It changes state on the server, and a `GET`
 * that changes state is a thing a link prefetcher, a mail scanner or a browser
 * extension can trigger without anybody asking for it.
 */
export function AccountMenu() {
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/account"
        className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Account
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
