import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import { Surface } from "@/components/ui/surface";
import { type } from "@/components/ui/typography";
import type { ContactCallToAction } from "@/data/types";

export function ContactSection({ contact }: { contact: ContactCallToAction }) {
  return (
    <Section id="contact" eyebrow="Contact" title={contact.heading}>
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
