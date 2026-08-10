"use client";

/**
 * The narrow-viewport navigation menu.
 *
 * Replaces a horizontally scrolling row of links. That row worked and was
 * keyboard operable, but it put a scrollbar inside the header — a piece of
 * desktop chrome in the middle of the page — and it hid links off the edge
 * where nothing announced they were there.
 *
 * ## Why a native `<dialog>`
 *
 * `showModal()` gives, correctly and for free:
 *
 *   * Escape closes it.
 *   * Focus moves into it and is trapped while open.
 *   * Focus returns to the trigger on close.
 *   * The rest of the page becomes inert — not clickable, not reachable by
 *     Tab.
 *   * `::backdrop` for the overlay.
 *
 * Every one of those is a classic hand-rolled-drawer bug. The same choice the
 * admin's drawer makes, for the same reasons.
 *
 * ## Why any client JavaScript at all
 *
 * The public site otherwise ships none, and that was worth protecting. A
 * `<details>` element would have kept it that way — but it stays open after a
 * link is chosen, so on a single-page anchor nav the menu would sit over the
 * section the visitor just asked to see. Closing on selection needs a click
 * handler, and this component is the smallest honest way to have one.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NavigationItem } from "@/data/types";

export function SiteNavMenu({
  navigation,
}: {
  navigation: readonly NavigationItem[];
}) {
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
  // platform rather than intercepting the key.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => setIsOpen(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  if (navigation.length === 0) return null;

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
        aria-label="Sections"
        // `nav-drawer` carries the slide-in. It has to be CSS rather than a
        // class toggled here: a modal `<dialog>` goes from `display: none` to
        // the top layer in one step, so there is no frame for a transition to
        // start from — which is why it appeared fully open with no motion. See
        // `globals.css`, where `@starting-style` supplies that first frame.
        className="nav-drawer m-0 ml-auto h-full max-h-none w-[17rem] max-w-[85vw] border-l border-subtle bg-bg p-0 text-fg backdrop:bg-black/40 lg:hidden"
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-muted hover:text-fg"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Close menu</span>
            </button>
          </div>

          <nav aria-label="Sections">
            <ul className="flex flex-col gap-1">
              {navigation.map((item) => (
                <li key={item.targetId}>
                  <Link
                    href={`/#${item.targetId}`}
                    // Closing on selection is the whole reason this is a
                    // client component: the menu covers the section the
                    // visitor just asked to see.
                    onClick={close}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-muted hover:text-fg"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  );
}
