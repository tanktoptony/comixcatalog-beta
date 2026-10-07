import { redirect } from "next/navigation";

// Adding books by hand was retired 2026-10-07: Scan a cover plus the
// catalog review queue replaced it. Old links and bookmarks land on /scan.
// Books people already added stay in their collections untouched.
export default function LibraryAddRetired() {
  redirect("/scan");
}
