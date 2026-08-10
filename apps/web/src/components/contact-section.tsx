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
      eyebrowAlternates={copy.eyebrowAlternates}
      title={copy.title}
      marker={copy.marker}
      icon={copy.icon}
    >
      {/*
        Two columns from `md` up, rather than one narrow column stacked on
        top of another.

        The form was `max-w-md` inside a `max-w-2xl` panel, so it left a
        column of empty space down its right-hand side and pushed the whole
        section taller than it needed to be — reported as the section taking
        up too much area. Setting the copy beside the form uses the width that
        was already there and roughly halves the height, without shrinking a
        single control: the fields keep their full size and touch targets.

        Below `md` it stacks, copy first, which is the order it should be read
        in anyway.
      */}
      {/*
        `padded={false}` with the padding supplied here.

        Leaving the default on would put `p-5 sm:p-6` and `p-6 sm:p-7` in the
        same class list, and Tailwind resolves that by stylesheet order, not by
        the order the classes appear in the attribute — so which padding won
        would depend on which utility Tailwind happened to emit last. Opting
        out states the intent instead of relying on that.
      */}
      <Surface
        tone="muted"
        padded={false}
        glass
        className="grid max-w-3xl gap-8 p-6 sm:p-7 md:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)] md:gap-8"
      >
        {/* Centred against the form rather than top-aligned. The copy is a
            line or two and the form is five controls tall, so aligning at the
            top leaves the left column looking abandoned. Only from `md`,
            where the two are actually side by side. */}
        <div className="md:self-center">
          <p className={type.body}>{contact.body}</p>
          {/* The email address stays alongside the form. Some people would
              rather use their own mail client, and a form is not a reason to
              hide the address. */}
          <div className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-4">
            <PlaceholderAction
              action={contact.primaryAction}
              context="contact"
            />
          </div>
        </div>

        <ContactForm />
      </Surface>
    </Section>
  );
}
