import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      { email, source: "footer", unsubscribed_at: null },
      { onConflict: "email" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("newsletter signup failed:", error);
    return NextResponse.json({ error: "Signup is temporarily unavailable" }, { status: 500 });
  }
}
