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
      accent={copy.accent}
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
          {/*
            The direct routes, alongside the form.

            Some people would rather use their own mail client, and a form is
            not a reason to hide the address — nor the number, which is the
            other thing people look for and which had nowhere to live until
            now.
          */}
          <div className="mt-6 flex flex-wrap items-start gap-3">
            {contact.primaryAction ? (
              <PlaceholderAction
                action={contact.primaryAction}
                context="contact"
              />
            ) : null}
            {contact.whatsappAction ? (
              <PlaceholderAction
                action={contact.whatsappAction}
                context="contact-whatsapp"
              />
            ) : null}
          </div>

          {/*
            And the values themselves, in plain text.

            `mailto:` opens a mail app on a phone and does nothing whatsoever
            in a desktop browser with no mail client registered — no error, no
            window, nothing. Reported exactly that way, and it is not a bug
            that can be fixed in the link: the browser has nowhere to send it.
            What can be fixed is being left with only that link. Printed here,
            the address and the number can be read, selected and copied on any
            machine, and the buttons above become a shortcut rather than the
            only way through.

            `select-all` so one click takes the whole value rather than a
            word of it, and `break-all` on the address because a long one
            would otherwise push the column wider than the card.
          */}
          {contact.email || contact.phone ? (
            <dl className="mt-5 flex flex-col gap-2">
              {contact.email ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className={type.fine}>Email</dt>
                  <dd className="select-all break-all font-mono text-sm text-fg">
                    {contact.email}
                  </dd>
                </div>
              ) : null}
              {contact.phone ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className={type.fine}>WhatsApp</dt>
                  <dd className="select-all font-mono text-sm text-fg">
                    {contact.phone}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <ContactForm />
      </Surface>
    </Section>
  );
}
