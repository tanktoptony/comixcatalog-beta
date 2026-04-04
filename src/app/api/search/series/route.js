import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  if (!q) {
    return NextResponse.json({ series: [] });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from("series")
    .select(`
      id,
      title,
      publishers(name)
    `)
    .ilike("title", `%${q}%`)
    .limit(25);

  if (error) {
    console.error("series search failed:", error);
    return NextResponse.json({ series: [] });
  }

  return NextResponse.json({ series: data || [] });
}