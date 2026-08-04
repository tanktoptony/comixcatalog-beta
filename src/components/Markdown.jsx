"use client";

/**
 * Tiny markdown renderer. Handles the subset blog posts actually use:
 *   - paragraphs (separated by blank lines)
 *   - ## h2 and ### h3 headings
 *   - bullet lists (lines starting with "- ")
 *   - **bold** and *italic* inline
 *   - [label](url) links
 *   - `inline code`
 *   - standalone image lines: ![alt](src) or a linked image [![alt](src)](href)
 *
 * Renders to React elements (not HTML), so user content is automatically
 * escaped. Swap to `react-markdown` later if you need full CommonMark.
 */
export default function Markdown({ source = "" }) {
  const blocks = parseBlocks(String(source));
  return <>{blocks.map((block, i) => renderBlock(block, i))}</>;
}

// ── Block parser ────────────────────────────────────────────────────────────

function parseBlocks(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4) });
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      i += 1;
      continue;
    }

    const linkedImageMatch = line
      .trim()
      .match(/^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/);
    if (linkedImageMatch) {
      const [, alt, src, href] = linkedImageMatch;
      blocks.push({ type: "img", alt, src, href });
      i += 1;
      continue;
    }

    const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const [, alt, src] = imageMatch;
      blocks.push({ type: "img", alt, src, href: null });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Paragraph — accumulate until blank line or block-element line
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("## ") &&
      !lines[i].startsWith("### ") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\[?!\[[^\]]*\]\([^)]+\)\]?(\([^)]+\))?$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

function renderBlock(block, key) {
  switch (block.type) {
    case "h2":
      return <h2 key={key} className="md-h2">{renderInline(block.text)}</h2>;
    case "h3":
      return <h3 key={key} className="md-h3">{renderInline(block.text)}</h3>;
    case "ul":
      return (
        <ul key={key} className="md-ul">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "p":
      return <p key={key} className="md-p">{renderInline(block.text)}</p>;
    case "img": {
      const img = <img src={block.src} alt={block.alt || ""} className="md-img" loading="lazy" />;
      return (
        <figure key={key} className="md-figure">
          {block.href ? (
            <a href={block.href} className="md-figure-link">
              {img}
            </a>
          ) : (
            img
          )}
          {block.alt && <figcaption className="md-figcaption">{block.alt}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
  }
}

// ── Inline parser ───────────────────────────────────────────────────────────
// Handles **bold**, *italic*, `code`, and [text](url). Returns an array of
// React nodes (strings + elements). React handles XSS escaping for us.

const INLINE_RE = new RegExp(
  [
    "(\\*\\*[^*]+\\*\\*)", // bold
    "(\\*[^*\\n]+\\*)", // italic
    "(`[^`\\n]+`)", // inline code
    "(\\[[^\\]]+\\]\\([^\\)]+\\))", // link
  ].join("|"),
  "g"
);

function renderInline(text) {
  if (!text) return null;
  const out = [];
  let lastIndex = 0;
  let m;
  let key = 0;

  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(text.slice(lastIndex, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={key++}>{renderInline(token.slice(2, -2))}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={key++} className="md-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, url] = linkMatch;
        const external = /^https?:\/\//i.test(url);
        out.push(
          <a
            key={key++}
            href={url}
            className="md-a"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {label}
          </a>
        );
      } else {
        out.push(token);
      }
    } else if (token.startsWith("*")) {
      out.push(<em key={key++}>{renderInline(token.slice(1, -1))}</em>);
    }
    lastIndex = m.index + token.length;
  }
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out;
}
