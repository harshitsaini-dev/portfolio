import { ContentImage } from "@/components/ui/content-image";
import { actionVariant } from "@/components/ui/action";
import type { SocialProfile } from "@/data/types";

/**
 * A row of links to profiles elsewhere.
 *
 * ## The label is always rendered
 *
 * Not icon-only, even when the editor has uploaded a logo. An icon alone is
 * unusable without sight, and ambiguous with it — plenty of platform marks
 * are a single letter, and a visitor should not have to recognise a logo to
 * know where a link goes. The logo sits beside the name as decoration, which
 * is why it is passed `decorative`.
 *
 * ## Semantics
 *
 * A `<ul>` inside a labelled `<nav>`: this is a set of links to elsewhere,
 * which is what `nav` describes, and the list tells a screen reader how many
 * there are before it starts reading them.
 */
export function SocialRow({
  socials,
  label,
}: {
  socials: readonly SocialProfile[];
  /** Accessible name for the group, e.g. "Profiles elsewhere". */
  label: string;
}) {
  if (socials.length === 0) return null;

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {socials.map((social) => (
          <li key={social.id}>
            <a
              href={social.url}
              // Editor-supplied destinations point off-site. `noopener` denies
              // the opened page a handle on this one; `noreferrer` keeps this
              // site's URL out of its logs.
              target="_blank"
              rel="noopener noreferrer me"
              className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${actionVariant.quiet}`}
            >
              {social.image ? (
                <ContentImage image={social.image} size={18} decorative />
              ) : null}
              {social.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
