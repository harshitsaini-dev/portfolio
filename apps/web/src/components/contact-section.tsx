import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import type { SectionCopy } from "@/lib/content/sections";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { ContactCallToAction } from "@/data/types";

export function ContactSection({
  contact,
  copy,
}: {
  contact: ContactCallToAction;
  copy: SectionCopy;
}) {
  return (
    <Section
      id={copy.key}
      eyebrow={copy.eyebrow}
      title={copy.title}
      marker={copy.marker}
    >
      <Surface tone="muted" className="p-8 sm:p-10">
        <p className={`max-w-2xl ${type.body}`}>{contact.body}</p>
        <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-4">
          <PlaceholderAction
            action={contact.primaryAction}
            variant="primary"
            context="contact"
          />
          <PlaceholderAction
            action={contact.secondaryAction}
            context="contact"
          />
        </div>
      </Surface>
    </Section>
  );
}
