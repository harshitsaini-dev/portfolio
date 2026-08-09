import { PlaceholderAction } from "@/components/placeholder-action";
import { ContactForm } from "@/components/contact-form";
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
      <Surface tone="muted" className="max-w-2xl p-6 sm:p-8">
        <p className={`max-w-2xl ${type.body}`}>{contact.body}</p>
        {/* The email address stays alongside the form. Some people would
            rather use their own mail client, and a form is not a reason to
            hide the address. */}
        <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-4">
          <PlaceholderAction
            action={contact.primaryAction}
            context="contact"
          />
        </div>

        <div className="mt-10">
          <ContactForm />
        </div>
      </Surface>
    </Section>
  );
}
