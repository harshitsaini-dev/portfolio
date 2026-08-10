/**
 * `schema.org/Person`, as JSON-LD.
 *
 * ## What it is for
 *
 * Everything else this site emits describes a *page*. This describes the
 * *person* — that the name in the heading is someone, that these accounts
 * belong to them, that this is their job title. It is what a search engine
 * reads to connect a name query to this site rather than to a page that
 * happens to contain the words.
 *
 * ## Every value is content
 *
 * Nothing here is written in this file. Name, role, location and links all
 * come from the CMS, so the structured data cannot drift from the visible
 * page. Structured data that disagrees with the page it is on is worse than
 * none: search engines treat the mismatch as an attempt to mislead them.
 *
 * ## Why it needs a nonce
 *
 * `application/ld+json` is data, not code — the browser never executes it. CSP
 * does not make that distinction: `script-src` applies to every `<script>`
 * element regardless of type, so without the nonce this is silently dropped
 * and the whole point of the file is lost with it.
 */

import type { SiteContent } from "@/data/types";
import { absoluteMediaUrl } from "@/lib/site-origin";

export function PersonSchema({
  content,
  origin,
  nonce,
}: {
  content: SiteContent;
  origin: string;
  nonce: string | undefined;
}) {
  const { profile, socials } = content;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.role,
    description: content.siteDescription ?? profile.tagline,
    url: origin,
    ...(profile.image
      ? { image: absoluteMediaUrl(origin, profile.image.id) }
      : {}),
    ...(profile.location
      ? { address: { "@type": "PostalAddress", addressLocality: profile.location } }
      : {}),
    // `sameAs` is the property that says "these accounts are the same person
    // as this page". Omitted entirely rather than sent empty, because an empty
    // array is a claim that there are none.
    ...(socials.length > 0 ? { sameAs: socials.map((social) => social.url) } : {}),
  };

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // The content is built from an object literal above and serialised
      // here, so there is no string being spliced into markup. `<` is escaped
      // because a `</script>` inside a JSON string value would otherwise close
      // this element early — the one way a data-only script can still become
      // an injection.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
