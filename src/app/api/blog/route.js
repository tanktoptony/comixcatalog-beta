import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  const supabase = getAnonClient();
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  // Single post
  if (slug) {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("published", true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ post: data });
  }

  // All posts
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ posts: data });
}

export async function POST(req) {
  const supabase = getAdminClient();

  const body = await req.json();
  const { title, slug, content, excerpt, user_id } = body;

  if (user_id !== ADMIN_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!title || !slug || !content) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      title,
      slug,
      content,
      excerpt,
      published: true,
      published_at: new Date().toISOString(),
      author_id: user_id,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }

  return NextResponse.json({ post: data }, { status: 201 });
}

export async function DELETE(req) {
  const supabase = getAdminClient();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const user_id = body?.user_id;

  if (user_id !== ADMIN_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { error } = await supabase
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Supabase delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}