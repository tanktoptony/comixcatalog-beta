"use client";

import dynamic from "next/dynamic";

// 🚫 Disable SSR completely for Search Page
const SearchPage = dynamic(() => import("./SearchPageClient"), {
  ssr: false,
});

export default SearchPage;
