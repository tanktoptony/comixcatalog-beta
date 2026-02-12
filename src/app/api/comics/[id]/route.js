import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req, context) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from("comics")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ comic: data });
}

export async function PATCH(req, context) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = await req.json();
  const { series_title, issue_number, publisher, release_year, user_id } = body;

  // 🔒 Verify ownership
  const { data: comic } = await supabase
    .from("comics")
    .select("created_by")
    .eq("id", id)
    .single();

  if (!comic || comic.created_by !== user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { error } = await supabase
    .from("comics")
    .update({
      series_title,
      issue_number,
      publisher,
      release_year,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req, context) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const body = await req.json();
  const { user_id } = body;

  // 🔒 Verify ownership
  const { data: comic } = await supabase
    .from("comics")
    .select("*")
    .eq("id", id)
    .single();

  console.log("FULL ROW:", comic);

  if (!comic || String(comic.created_by) !== String(user_id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await supabase.from("comics").delete().eq("id", id);

  return NextResponse.json({ success: true });
}
