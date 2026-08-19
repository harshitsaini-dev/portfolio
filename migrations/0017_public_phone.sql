-- A public WhatsApp number beside the public email, and a switch for each.
--
-- The contact section offered exactly one way to reach the owner directly and
-- it was an email address. On a phone `mailto:` opens a mail app; in a desktop
-- browser with no mail client registered it does nothing at all — no error, no
-- window — which is how this came to be reported. A second route was wanted,
-- and WhatsApp rather than a dialler: it is the one most people actually
-- answer, and `https://wa.me/` works on a desktop where `tel:` does not.
--
-- The number is nullable and null is the normal state: a portfolio that does
-- not publish one simply leaves it empty and no button is rendered. It is
-- stored exactly as typed, because reformatting somebody's own number is the
-- kind of helpfulness that gets an international prefix wrong; the link
-- strips it down to digits at the point of use.
--
-- The two flags are separate from "is there a value". Clearing a number to
-- hide it and then typing it back in when you want it again is not editing,
-- it is a workaround; the owner asked to be able to turn each route off
-- without losing what it was set to.
ALTER TABLE profile ADD COLUMN public_phone TEXT;

ALTER TABLE profile ADD COLUMN is_public_email_visible INTEGER NOT NULL DEFAULT 1
  CHECK (is_public_email_visible IN (0, 1));

ALTER TABLE profile ADD COLUMN is_whatsapp_visible INTEGER NOT NULL DEFAULT 1
  CHECK (is_whatsapp_visible IN (0, 1));
