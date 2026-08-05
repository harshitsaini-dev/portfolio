import { Section } from "@/components/section";
import { type } from "@/components/ui/typography";
import type { Profile } from "@/data/types";

export function AboutSection({ profile }: { profile: Profile }) {
  return (
    <Section id="about" eyebrow="Profile" title="About">
      <div className={`max-w-2xl space-y-5 ${type.body}`}>
        {profile.introduction.map((paragraph, index) => (
          // Paragraph order is fixed and the list is never reordered or
          // filtered, so the index is a stable key here.
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </Section>
  );
}
