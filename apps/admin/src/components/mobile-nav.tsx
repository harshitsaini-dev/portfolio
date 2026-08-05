"use client";

/**
 * Mobile navigation drawer.
 *
 * Built on a native `<dialog>` opened with `showModal()`, which is why this
 * file is short. The platform already provides, correctly and for free:
 *
 *   * Escape closes the dialog.
 *   * Focus is moved into the dialog and trapped there while open.
 *   * Focus returns to the trigger on close.
 *   * The rest of the page becomes inert — background content is neither
 *     clickable nor reachable by Tab.
 *   * `::backdrop` for the overlay.
 *
 * Every one of those is a classic hand-rolled-drawer bug. Using the native
 * element instead of a `<div role="dialog">` and a focus-trap library is the
 * accessible-by-default choice, and adds nothing to the bundle.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AdminNav } from "./admin-nav";

export function MobileNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // `close` fires for Escape too, so this keeps React state in sync with the
  // platform rather than trying to intercept the key itself.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => setIsOpen(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-strong bg-surface px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-muted lg:hidden"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ☰
        </span>
        Menu
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Admin sections"
        className="m-0 h-full max-h-none w-[19rem] max-w-[85vw] border-r border-subtle bg-bg p-0 text-fg backdrop:bg-black/40 lg:hidden"
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight">
              Portfolio Admin
            </span>
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-muted hover:text-fg"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          <AdminNav onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
