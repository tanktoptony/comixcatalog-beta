// Send one newsletter issue to every active subscriber via Resend.
//
//   node scripts/sendNewsletter.js content/newsletter/2026-10-first-issue.md              # dry run: renders, counts, sends nothing
//   node scripts/sendNewsletter.js content/newsletter/2026-10-first-issue.md --test=you@x  # sends ONLY to that address
//   node scripts/sendNewsletter.js content/newsletter/2026-10-first-issue.md --apply       # sends to the list
//
// Issue files: frontmatter (`subject`, `preheader`) then a Markdown body in
// the same subset the blog renders (headings, bold/italic, links, lists,
// standalone images). Rendered to simple HTML + a text alternative.
//
// Rules that are not optional:
// - Every recipient has unsubscribed_at IS NULL, checked at send time.
// - Every email carries a signed one-click unsubscribe link in the footer
//   and in List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058).
// - Sends are recorded in content/newsletter/.sent.json (committed by the
//   workflow) so the same issue cannot go out twice by accident.
// - RESEND_API_KEY / RESEND_FROM_EMAIL come from the environment only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, resendBatch, unsubscribeUrl } from "../src/lib/newsletter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const args = Object.fromEntries(process.argv.slice(3).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const file = process.argv[2];
const APPLY = Boolean(args.apply);
const TEST_TO = typeof args.test === "string" ? args.test : null;
const SENT_LEDGER = path.resolve(__dirname, "../content/newsletter/.sent.json");
if (!file) { console.error("usage: node scripts/sendNewsletter.js <content/newsletter/issue.md> [--test=email] [--apply]"); process.exit(2); }

function parse(markdown) {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error("missing frontmatter block");
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  if (!meta.subject) throw new Error('frontmatter needs "subject"');
  return { subject: meta.subject, preheader: meta.preheader ?? "", body: m[2].trim() };
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0b1e6b">$1</a>');
}

// Tiny Markdown -> email HTML. Inline styles only; email clients ignore
// stylesheets. Mirrors what src/components/Markdown.jsx supports.
function render(body) {
  const blocks = body.split(/\n\s*\n/);
  const html = [];
  const text = [];
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const img = b.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { html.push(`<p style="margin:0 0 18px"><img src="${img[2]}" alt="${esc(img[1])}" style="max-width:100%;height:auto;border-radius:8px"></p>`); text.push(`[image: ${img[1]}] ${img[2]}`); continue; }
    if (b.startsWith("### ")) { html.push(`<h3 style="font-size:17px;margin:22px 0 8px">${inline(b.slice(4))}</h3>`); text.push(b.slice(4).toUpperCase()); continue; }
    if (b.startsWith("## ")) { html.push(`<h2 style="font-size:20px;margin:26px 0 10px">${inline(b.slice(3))}</h2>`); text.push(b.slice(3).toUpperCase()); continue; }
    if (b.split("\n").every((l) => l.startsWith("- "))) {
      html.push(`<ul style="margin:0 0 18px;padding-left:22px">${b.split("\n").map((l) => `<li style="margin:4px 0">${inline(l.slice(2))}</li>`).join("")}</ul>`);
      text.push(b.split("\n").map((l) => `  * ${l.slice(2)}`).join("\n")); continue;
    }
    html.push(`<p style="margin:0 0 18px">${inline(b).replace(/\n/g, "<br>")}</p>`);
    text.push(b.replace(/\*\*|\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"));
  }
  return { html: html.join("\n"), text: text.join("\n\n") };
}

function wrap({ subject, preheader, html, text }, unsub) {
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f4f4f6;font:16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<span style="display:none;max-height:0;overflow:hidden;color:transparent">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#fff;border-radius:12px" cellspacing="0" cellpadding="0">
<tr><td style="padding:26px 30px 8px;font-weight:900;font-size:18px;letter-spacing:.04em;color:#0b1e6b">COMIX<span style="color:#c99a1a">CATALOG</span></td></tr>
<tr><td style="padding:8px 30px 26px">${html}</td></tr>
<tr><td style="padding:18px 30px 26px;border-top:1px solid #e6e6ea;font-size:12px;color:#666">
You get this because you signed up at <a href="${SITE_URL}" style="color:#0b1e6b">comixcatalog.com</a>. Written by Anthony, who builds the site.<br>
<a href="${unsub}" style="color:#666">Unsubscribe</a> (one click, works the first time).
</td></tr></table></td></tr></table></body></html>`;
  const plain = `${text}\n\n--\nYou get this because you signed up at ${SITE_URL}.\nUnsubscribe: ${unsub}\n`;
  return { html: page, text: plain };
}

async function run() {
  const issue = parse(fs.readFileSync(file, "utf8"));
  const slug = path.basename(file).replace(/\.md$/, "");
  const rendered = render(issue.body);
  const sent = fs.existsSync(SENT_LEDGER) ? JSON.parse(fs.readFileSync(SENT_LEDGER, "utf8")) : {};
  if (APPLY && sent[slug]) { console.error(`Refusing: ${slug} was already sent on ${sent[slug].at} to ${sent[slug].count} people. Remove it from content/newsletter/.sent.json if you really mean it.`); process.exit(1); }

  let recipients;
  if (TEST_TO) {
    recipients = [TEST_TO.trim().toLowerCase()];
  } else {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const rows = [];
    let last = 0;
    for (;;) {
      const { data, error } = await supabase.from("newsletter_subscribers").select("id, email").is("unsubscribed_at", null).gt("id", last).order("id").limit(1000);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
      last = data[data.length - 1].id;
    }
    recipients = rows.map((r) => r.email);
  }

  console.log(`${APPLY || TEST_TO ? "Sending" : "Dry run"}: "${issue.subject}" (${slug})`);
  console.log(`  recipients: ${recipients.length}${TEST_TO ? " (test address only)" : " active subscribers"}`);
  console.log(`  body: ${issue.body.split(/\s+/).length} words`);
  if (!APPLY && !TEST_TO) {
    const sample = wrap({ ...issue, ...rendered }, unsubscribeUrl("preview@example.com"));
    const out = path.resolve(__dirname, "../content/newsletter/.preview.html");
    fs.writeFileSync(out, sample.html);
    console.log(`  preview written to ${path.relative(process.cwd(), out)} (open it in a browser)\n\nRe-run with --test=you@example.com to send one, or --apply to send to the list.`);
    return;
  }

  const messages = recipients.map((to) => {
    const unsub = unsubscribeUrl(to);
    const { html, text } = wrap({ ...issue, ...rendered }, unsub);
    return {
      to,
      subject: issue.subject,
      html,
      text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  });
  const results = await resendBatch(messages);
  console.log(`  accepted by Resend: ${results.length}`);
  if (APPLY) {
    sent[slug] = { at: new Date().toISOString(), count: recipients.length };
    fs.writeFileSync(SENT_LEDGER, JSON.stringify(sent, null, 2) + "\n");
    console.log(`  recorded in content/newsletter/.sent.json`);
  }
}

run().catch((err) => { console.error(err.message ?? err); process.exit(1); });
