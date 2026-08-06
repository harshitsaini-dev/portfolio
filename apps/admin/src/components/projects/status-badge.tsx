import type { ProjectStatus } from "@portfolio/types";

/**
 * Project status indicator.
 *
 * The status word itself is always shown — colour and weight only
 * reinforce it. Status is never communicated by colour alone.
 */
const styles: Record<ProjectStatus, string> = {
  published: "border-accent/40 bg-accent-soft text-accent",
  draft: "border-subtle bg-surface-muted text-fg-muted",
  archived: "border-subtle bg-surface-muted text-fg-muted",
};

const labels: Record<ProjectStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
