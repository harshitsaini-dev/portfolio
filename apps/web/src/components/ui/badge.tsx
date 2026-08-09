interface BadgeListProps {
  items: readonly string[];
  /** Accessible name for the list, e.g. "Technologies used". */
  label: string;
}

/**
 * A wrapping list of short labels (technologies, skills).
 *
 * A real `<ul>` so assistive technology announces the item count instead of
 * reading a run-on line. The pill treatment is intentionally quiet: these are
 * metadata, not calls to action, and giving them accent colour would compete
 * with the one real accent on the page.
 */
export function BadgeList({ items, label }: BadgeListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="glow-hover rounded-full border border-subtle bg-surface-muted px-2.5 py-1 text-xs font-medium text-fg-muted"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
