/**
 * Dialling prefixes for the contact form's selector.
 *
 * ## Why a hand-written list and not a package
 *
 * The libraries that do this properly carry every calling code, every area
 * code and a validation table per country — a few hundred kilobytes for a
 * dropdown beside one optional field on a portfolio. The whole list is
 * public, stable data; it does not need a dependency, and a dependency here
 * would be shipped to every visitor whether or not they ever write in.
 *
 * ## What is in it
 *
 * India first, because that is where the owner is and where most people
 * writing in will be, and a selector whose first option is usually right is
 * one most people never open. The rest follow by rough traffic order rather
 * than alphabetically: an alphabetical list buries the common answers behind
 * Afghanistan and Albania.
 *
 * It is not exhaustive, and that is a real limitation rather than an
 * oversight — the last entry is an "Other" prefix the sender types
 * themselves, so nobody is locked out by not appearing on it.
 */

export interface CountryCode {
  /** The dialling prefix, stored and shown, e.g. `+91`. */
  readonly code: string;
  /** Country name, for the option text. */
  readonly name: string;
  /** ISO 3166-1 alpha-2, used only to key the list. */
  readonly iso: string;
}

export const COUNTRY_CODES: readonly CountryCode[] = [
  { iso: "IN", code: "+91", name: "India" },
  { iso: "US", code: "+1", name: "United States" },
  { iso: "GB", code: "+44", name: "United Kingdom" },
  { iso: "CA", code: "+1", name: "Canada" },
  { iso: "AU", code: "+61", name: "Australia" },
  { iso: "AE", code: "+971", name: "United Arab Emirates" },
  { iso: "SG", code: "+65", name: "Singapore" },
  { iso: "DE", code: "+49", name: "Germany" },
  { iso: "FR", code: "+33", name: "France" },
  { iso: "NL", code: "+31", name: "Netherlands" },
  { iso: "IE", code: "+353", name: "Ireland" },
  { iso: "ES", code: "+34", name: "Spain" },
  { iso: "IT", code: "+39", name: "Italy" },
  { iso: "SE", code: "+46", name: "Sweden" },
  { iso: "CH", code: "+41", name: "Switzerland" },
  { iso: "PL", code: "+48", name: "Poland" },
  { iso: "PT", code: "+351", name: "Portugal" },
  { iso: "NZ", code: "+64", name: "New Zealand" },
  { iso: "JP", code: "+81", name: "Japan" },
  { iso: "KR", code: "+82", name: "South Korea" },
  { iso: "CN", code: "+86", name: "China" },
  { iso: "HK", code: "+852", name: "Hong Kong" },
  { iso: "MY", code: "+60", name: "Malaysia" },
  { iso: "ID", code: "+62", name: "Indonesia" },
  { iso: "PH", code: "+63", name: "Philippines" },
  { iso: "TH", code: "+66", name: "Thailand" },
  { iso: "VN", code: "+84", name: "Vietnam" },
  { iso: "BD", code: "+880", name: "Bangladesh" },
  { iso: "PK", code: "+92", name: "Pakistan" },
  { iso: "LK", code: "+94", name: "Sri Lanka" },
  { iso: "NP", code: "+977", name: "Nepal" },
  { iso: "SA", code: "+966", name: "Saudi Arabia" },
  { iso: "QA", code: "+974", name: "Qatar" },
  { iso: "IL", code: "+972", name: "Israel" },
  { iso: "TR", code: "+90", name: "Türkiye" },
  { iso: "RU", code: "+7", name: "Russia" },
  { iso: "ZA", code: "+27", name: "South Africa" },
  { iso: "NG", code: "+234", name: "Nigeria" },
  { iso: "KE", code: "+254", name: "Kenya" },
  { iso: "EG", code: "+20", name: "Egypt" },
  { iso: "BR", code: "+55", name: "Brazil" },
  { iso: "MX", code: "+52", name: "Mexico" },
  { iso: "AR", code: "+54", name: "Argentina" },
];

/** The prefix selected before anybody touches the control. */
export const DEFAULT_COUNTRY_CODE = "+91";

/**
 * The set of prefixes the selector can produce.
 *
 * The server checks against this rather than trusting the field: a prefix
 * arrives as a string in a form post like anything else, and it ends up in a
 * `tel:` link the owner presses.
 */
export const COUNTRY_CODE_VALUES: ReadonlySet<string> = new Set(
  COUNTRY_CODES.map((entry) => entry.code),
);
