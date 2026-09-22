import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// `source` is what tells us which placement actually converts (the column
// exists for exactly that). Allowlisted so the DB never sees junk.
const SOURCES = new Set(["footer", "page", "house_ad", "post_signup", "blog", "profile"]);

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const source = SOURCES.has(body.source) ? body.source : "footer";
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Re-subscribing clears unsubscribed_at and records the placement that
    // brought them back.
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      { email, source, unsubscribed_at: null },
      { onConflict: "email", ignoreDuplicates: false }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("newsletter signup failed:", error);
    return NextResponse.json({ error: "Signup is temporarily unavailable" }, { status: 500 });
  }
}
