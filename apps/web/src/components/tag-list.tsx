interface TagListProps {
  items: readonly string[];
  /** Accessible name for the list, e.g. "Technologies used". */
  label: string;
}

/**
 * A wrapping list of short labels (technologies, skills). Rendered as a real
 * <ul> so assistive technology announces the item count rather than reading
 * a run-on line of text.
 */
export function TagList({ items, label }: TagListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
