"use client";

/**
 * Opens the browser's print dialog.
 *
 * A button rather than an instruction to press Ctrl+P: the keyboard shortcut is
 * not obvious on a phone, where "print" usually means "save as PDF" and is
 * exactly what someone wants from a résumé page.
 *
 * It is a real `<button>`, so it is focusable and reachable by keyboard for
 * free — and it hides itself in the printed output rather than appearing as a
 * grey rectangle on the page it just produced.
 */

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Print or save as PDF
    </button>
  );
}
