// /lib/search/supabaseSearch.js

import { supabase } from "@/lib/supabaseClient";

export async function supabaseSearch(query) {
  const { data, error } = await supabase
    .from("comics")
    .select(
      "id, title, series, issue_number, year, cover_url, publisher, creator"
    )
    .ilike("title", `%${query}%`)
    .limit(60);

  if (error) {
    console.error("Supabase search error:", error);
    return [];
  }

  return data || [];
}
