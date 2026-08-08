import { Section } from "@/components/section";
import type { SectionCopy } from "@/lib/content/sections";
import { type } from "@/components/ui/typography";
import type { Profile } from "@/data/types";

export function AboutSection({
  profile,
  copy,
}: {
  profile: Profile;
  copy: SectionCopy;
}) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      title={copy.title}
      marker={copy.marker}
    >
      <div className={`max-w-2xl space-y-5 ${type.body}`}>
        {profile.introduction.length === 0 ? (
          <p className={type.bodySm}>
            No biography has been written yet.
          </p>
        ) : null}
        {profile.introduction.map((paragraph, index) => (
          // Paragraph order is fixed and the list is never reordered or
          // filtered, so the index is a stable key here.
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}
