// One-click unsubscribe. Linked from every newsletter footer and from the
// List-Unsubscribe header (RFC 8058 wants the same URL to accept a POST with
// List-Unsubscribe=One-Click, which mail clients send without loading a page).
//
// GET renders a tiny confirmation page; POST is the mail-client path and
// just returns 200. Both verify the HMAC token before writing anything, so
// a guessed email cannot unsubscribe someone else.

import { createClient } from "@supabase/supabase-js";
import { emailFromParam, verifyUnsubscribeToken } from "@/lib/newsletter";

async function unsubscribe(searchParams) {
  const email = emailFromParam(searchParams.get("e"));
  const token = searchParams.get("t");
  if (!email || !verifyUnsubscribeToken(email, token)) return { ok: false, status: 400 };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email)
    .is("unsubscribed_at", null);
  if (error) {
    console.error("newsletter unsubscribe failed:", error);
    return { ok: false, status: 500 };
  }
  return { ok: true, status: 200 };
}

function page(title, body, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#090c11;color:#eef2f7;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:32px 24px;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#a4aebb;margin:0 0 1.25rem}a{color:#f4d03f}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="/">Back to ComixCatalog</a></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request) {
  const result = await unsubscribe(new URL(request.url).searchParams);
  if (result.status === 400) return page("That link did not work", "It may be incomplete. Reply to any newsletter and I will take you off by hand.", 400);
  if (!result.ok) return page("Something went wrong", "Try the link again in a minute, or reply to any newsletter.", 500);
  return page("You are unsubscribed", "No more newsletters. Your account and collection are untouched. Come back any time.");
}

export async function POST(request) {
  const result = await unsubscribe(new URL(request.url).searchParams);
  return new Response(null, { status: result.ok ? 200 : result.status });
}
