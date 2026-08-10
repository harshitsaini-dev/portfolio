/**
 * A small Markdown renderer for CMS-authored note bodies.
 *
 * ## Why not a Markdown library
 *
 * Every mainstream one either emits an HTML string — which means
 * `dangerouslySetInnerHTML`, which means the CMS can inject arbitrary markup
 * into the page — or ships a sanitiser to undo that, which is a second
 * dependency guarding the first. This builds React elements directly, so there
 * is no HTML string anywhere and nothing to sanitise: an element that this file
 * does not construct cannot appear on the page. Raw HTML in a note is rendered
 * as the literal text it is.
 *
 * ## The subset, and why it stops there
 *
 * Headings, paragraphs, lists, fenced code, inline code, links, images, quotes,
 * rules, bold and italic. That is what someone writing about their work
 * actually uses. Tables, footnotes and nested lists are absent because each is
 * a real parser and none earns its complexity on a portfolio's notes.
 *
 * Link URLs are restricted to http, https, mailto and site-relative paths. A
 * `javascript:` href in a stored post would be script execution by content —
 * exactly the hole `dangerouslySetInnerHTML` would have opened.
 */

import Link from "next/link";
import type { ReactNode } from "react";

/** What a link is allowed to point at. See the module comment. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.startsWith("/") || href.startsWith("#")) return href;
  try {
    const { protocol } = new URL(href);
    return ["http:", "https:", "mailto:"].includes(protocol) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Inline formatting, applied in one pass.
 *
 * One regex with alternatives rather than a chain of `.replace()` calls: the
 * chain would let a URL inside a code span be turned into a link, because the
 * later pass cannot see that the earlier one already claimed that text.
 * Matching left-to-right, once, means whichever construct starts first wins —
 * so `` `**not bold**` `` stays literal inside the code span.
 */
const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-fg"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("![")) {
      const alt = token.slice(2, token.indexOf("]"));
      const src = safeHref(token.slice(token.indexOf("(") + 1, -1));
      // No `next/image`: these are CMS URLs of unknown dimensions, and the
      // project serves its own media as plain `<img>` for the same reason.
      // eslint-disable-next-line @next/next/no-img-element
      if (src) out.push(<img key={key} src={src} alt={alt} className="my-6 h-auto w-full rounded-lg" loading="lazy" />);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = safeHref(token.slice(token.indexOf("(") + 1, -1));
      out.push(
        href ? (
          <Link
            key={key}
            href={href}
            className="text-accent underline underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {label}
          </Link>
        ) : (
          // A rejected URL keeps its text. Silently dropping the label would
          // lose a sentence's meaning over a link the reader never saw.
          <span key={key}>{label}</span>
        ),
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_CLASSES = [
  "mt-10 text-2xl font-semibold text-fg",
  "mt-8 text-xl font-semibold text-fg",
  "mt-6 text-lg font-semibold text-fg",
] as const;

export function Markdown({ body }: { body: string }) {
  // `\r\n` first: a body pasted from Windows would otherwise leave a stray
  // carriage return on every line, which breaks the fence and list checks
  // below in a way that is invisible in the editor.
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      index += 1;
      continue;
    }

    // Fenced code. Consumed verbatim — nothing inside is parsed, which is the
    // entire point of a code block.
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // the closing fence, or the end of the body
      blocks.push(
        <pre
          key={`b${key++}`}
          // Scrolls itself rather than widening the page — a long line in a
          // snippet must never make the whole article scroll sideways.
          className="my-6 overflow-x-auto rounded-lg border border-subtle bg-surface p-4 text-sm"
        >
          <code className="font-mono text-fg" data-language={language || undefined}>
            {code.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    if (trimmed.startsWith("#")) {
      const level = Math.min(trimmed.match(/^#+/)?.[0].length ?? 1, 3);
      const text = trimmed.slice(level).trim();
      const className = HEADING_CLASSES[level - 1];
      // Levels are capped at 3 and offset by one: the page's own `<h1>` is the
      // note's title, so a body heading starts at `<h2>`. A body that jumped
      // back to `<h1>` would give the document two top-level headings.
      const Tag = (["h2", "h3", "h4"] as const)[level - 1] ?? "h4";
      blocks.push(
        <Tag key={`b${key++}`} className={className}>
          {renderInline(text, `b${key}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      blocks.push(<hr key={`b${key++}`} className="my-10 border-subtle" />);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("> ")) {
        quote.push((lines[index] ?? "").trim().slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className="my-6 border-l-2 border-accent pl-4 italic text-fg-muted"
        >
          {renderInline(quote.join(" "), `b${key}`)}
        </blockquote>,
      );
      continue;
    }

    const isBullet = /^[-*+] /.test(trimmed);
    const isNumbered = /^\d+\. /.test(trimmed);
    if (isBullet || isNumbered) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? "").trim();
        const matches = isBullet ? /^[-*+] /.test(candidate) : /^\d+\. /.test(candidate);
        if (!matches) break;
        items.push(candidate.replace(isBullet ? /^[-*+] / : /^\d+\. /, ""));
        index += 1;
      }
      const ListTag = isBullet ? "ul" : "ol";
      blocks.push(
        <ListTag
          key={`b${key++}`}
          className={`my-5 space-y-2 pl-6 text-fg-muted ${isBullet ? "list-disc" : "list-decimal"}`}
        >
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `b${key}-${i}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // A paragraph runs until a blank line, so a sentence wrapped across two
    // lines in the editor stays one sentence on the page.
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      const candidate = (lines[index] ?? "").trim();
      if (
        candidate.startsWith("#") ||
        candidate.startsWith("```") ||
        candidate.startsWith("> ") ||
        candidate === "---" ||
        /^[-*+] /.test(candidate) ||
        /^\d+\. /.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate);
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`b${key++}`} className="my-5 leading-relaxed text-fg-muted">
          {renderInline(paragraph.join(" "), `b${key}`)}
        </p>,
      );
    }
  }

  return <div className="max-w-2xl">{blocks}</div>;
}
