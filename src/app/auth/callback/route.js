import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const supabase = supabaseServer();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (exchangeError) {
    console.error("AUTH CALLBACK EXCHANGE ERROR:", exchangeError);
    return NextResponse.redirect(
      new URL("/login?error=confirmation_failed", requestUrl.origin)
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("AUTH CALLBACK USER ERROR:", userError);
    return NextResponse.redirect(
      new URL("/login?error=session_failed", requestUrl.origin)
    );
  }

  const username = user.user_metadata?.username;
  const avatarKey = user.user_metadata?.avatar_key || "hero_01";

  if (!username) {
    return NextResponse.redirect(
      new URL("/complete-profile", requestUrl.origin)
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username,
      avatar_key: avatarKey,
      is_public: true,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("AUTH CALLBACK PROFILE UPSERT ERROR:", profileError);
    return NextResponse.redirect(
      new URL("/complete-profile", requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(`/u/${username}`, requestUrl.origin));
}