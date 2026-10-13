import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { sanitizeSavedAttribution } from "@/lib/attribution";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incoming = sanitizeSavedAttribution(await req.json().catch(() => ({})));
  if (!Object.keys(incoming).length) return NextResponse.json({ saved: false });

  const profileAttribution = Object.fromEntries(Object.entries(incoming).filter(([key]) => key !== "ref"));
  if (!Object.keys(profileAttribution).length) return NextResponse.json({ saved: false, ref: incoming.ref || null });
  const patch = Object.fromEntries(Object.entries(profileAttribution).map(([key, value]) => [`signup_${key}`, value]));
  const { data, error } = await getServiceClient().from("profiles").update(patch)
    .eq("id", user.id)
    .is("signup_source", null).is("signup_medium", null).is("signup_campaign", null)
    .is("signup_referrer_host", null).is("signup_landing_path", null)
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save attribution" }, { status: 500 });
  return NextResponse.json({ saved: Boolean(data) });
}
