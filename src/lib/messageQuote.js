// Replies quote the message they answer, Slack style, without a schema
// change: the reply's body starts with "> <quoted text>" lines, then a blank
// line, then the reply. splitQuote() reads that back for display; anything
// else renders as plain text.

export const QUOTE_MAX = 140;

const QUOTE_LINE = /^> ?(.*)$/;

// Leading "> " lines become the quote. A body that is only quote lines stays
// plain text, so a message never renders as an empty bubble.
export function splitQuote(body) {
  const value = String(body ?? "");
  const lines = value.split(/\r?\n/);
  const quoted = [];
  let i = 0;
  while (i < lines.length && QUOTE_LINE.test(lines[i])) {
    quoted.push(lines[i].match(QUOTE_LINE)[1]);
    i += 1;
  }
  const text = lines.slice(i).join("\n").replace(/^\s*\n/, "").trim();
  const quote = quoted.join(" ").trim();
  if (!quoted.length || !quote || !text) return { quote: null, text: value };
  return { quote, text };
}

// One short line of the message being answered. A reply to a reply quotes
// only the answer, not the whole chain.
export function quoteSnippet(body) {
  const { text } = splitQuote(body);
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= QUOTE_MAX) return flat;
  return `${flat.slice(0, QUOTE_MAX - 1).trimEnd()}…`;
}

export function buildReply(snippet, reply) {
  const quote = String(snippet ?? "").replace(/\s+/g, " ").trim();
  const answer = String(reply ?? "").trim();
  if (!quote) return answer;
  return `> ${quote}\n\n${answer}`;
}
