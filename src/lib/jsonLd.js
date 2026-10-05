// Serialize structured data for a <script type="application/ld+json"> tag.
//
// JSON.stringify does not escape "<", so a string containing "</script>"
// closes the tag and everything after it is parsed as HTML. Listing pages
// put seller-written text (condition notes) into JSON-LD, which made that a
// stored XSS (audit S1, 2026-10-05). Escaping < > & as their \u00XX forms
// keeps the JSON identical to a parser and inert to the HTML tokenizer;
// U+2028/U+2029 are escaped too, since some JS parsers treat them as line
// breaks inside strings.
// Built from char codes: a literal U+2028 inside a regex is a line break to
// the JS parser.
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");

export function safeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEP, "\\u2028")
    .replace(PARA_SEP, "\\u2029");
}
