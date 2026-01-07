// /lib/search/index.js

import { localSearch } from "./localSQLite";
import { supabaseSearch } from "./supabaseSearch";

export async function searchComics(query) {
  const mode = process.env.NEXT_PUBLIC_SEARCH_MODE || "local";

  if (mode === "local") {
    return await localSearch(query);
  }

  return await supabaseSearch(query);
}
