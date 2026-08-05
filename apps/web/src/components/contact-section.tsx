import { PlaceholderAction } from "@/components/placeholder-action";
import { Section } from "@/components/section";
import type { ContactCallToAction } from "@/data/types";

export function ContactSection({ contact }: { contact: ContactCallToAction }) {
  return (
    <Section id="contact" title={contact.heading}>
      <p className="max-w-2xl text-base leading-relaxed text-muted">
        {contact.body}
      </p>
      <div className="mt-8 flex flex-wrap items-start gap-4">
        <PlaceholderAction
          action={contact.primaryAction}
          variant="primary"
          context="contact"
        />
        <PlaceholderAction action={contact.secondaryAction} context="contact" />
      </div>
    </Section>
  );
}
