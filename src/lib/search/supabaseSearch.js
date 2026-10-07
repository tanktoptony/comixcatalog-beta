// /lib/search/supabaseSearch.js

import { supabase } from "@/lib/supabaseClient";

export async function supabaseSearch(query) {
  const { data: { user } } = await supabase.auth.getUser();
  let request = supabase
    .from("comics")
    .select(
      "id, title, series, issue_number, year, cover_url, publisher, creator"
    )
    .ilike("title", `%${query}%`);
  request = user ? request.or(`review_status.eq.approved,created_by.eq.${user.id}`) : request.eq("review_status", "approved");
  const { data, error } = await request.limit(60);

  if (error) {
    console.error("Supabase search error:", error);
    return [];
  }

  return data || [];
}
