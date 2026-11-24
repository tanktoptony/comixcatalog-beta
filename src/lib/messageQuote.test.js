import test from "node:test";
import assert from "node:assert/strict";
import { buildReply, quoteSnippet, splitQuote, QUOTE_MAX } from "./messageQuote.js";

test("a reply round-trips into quote and text", () => {
  const body = buildReply("Do you still have ASM #300?", "Yes, NM 9.4");
  assert.equal(body, "> Do you still have ASM #300?\n\nYes, NM 9.4");
  assert.deepEqual(splitQuote(body), { quote: "Do you still have ASM #300?", text: "Yes, NM 9.4" });
});

test("plain messages have no quote", () => {
  assert.deepEqual(splitQuote("hello there"), { quote: null, text: "hello there" });
  assert.deepEqual(splitQuote(""), { quote: null, text: "" });
  assert.deepEqual(splitQuote(null), { quote: null, text: "" });
});

test("a > in the middle of a message is not a quote", () => {
  const body = "price check:\n> 9.8 is $400";
  assert.deepEqual(splitQuote(body), { quote: null, text: body });
});

test("a body that is only quote lines stays plain text", () => {
  assert.deepEqual(splitQuote("> just this"), { quote: null, text: "> just this" });
  assert.deepEqual(splitQuote("> \n\nhi"), { quote: null, text: "> \n\nhi" });
});

test("multi-line replies keep their line breaks", () => {
  const body = buildReply("Trade?", "Sure.\nWhat for?");
  assert.deepEqual(splitQuote(body), { quote: "Trade?", text: "Sure.\nWhat for?" });
});

test("Windows line breaks still split", () => {
  assert.deepEqual(splitQuote("> hi\r\n\r\nback"), { quote: "hi", text: "back" });
});

test("the snippet is one line, capped, and drops an earlier quote", () => {
  assert.equal(quoteSnippet("line one\nline two"), "line one line two");
  assert.equal(quoteSnippet(buildReply("old question", "new answer")), "new answer");
  const long = "x".repeat(QUOTE_MAX + 50);
  const snip = quoteSnippet(long);
  assert.equal(snip.length, QUOTE_MAX);
  assert.ok(snip.endsWith("…"));
});

test("an empty quote leaves the reply alone", () => {
  assert.equal(buildReply("", "hi"), "hi");
  assert.equal(buildReply("  ", " hi "), "hi");
});
