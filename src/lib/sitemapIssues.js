// The issue files in the sitemap. scripts/buildIssueSitemap.js fills
// sitemap_issue_chunks once a night and this only reads it: a short list for
// the index, and one row by primary key for a file. Nothing here walks
// gcd_issues. The table is service-role only.

import { getServiceClient } from "@/lib/supabase/service";
import { SITE_URL } from "@/lib/siteUrl";
import { issueChunkName, issueEntriesFromIds, parseIssueChunkName } from "@/lib/sitemapIssueChunks";

// updated_at only moves when a file's list changes, so it is a true <lastmod>.
export async function issueSitemapFiles() {
  const { data, error } = await getServiceClient()
    .from("sitemap_issue_chunks")
    .select("chunk, updated_at")
    .order("chunk", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({ name: issueChunkName(row.chunk), lastModified: row.updated_at }));
}

// null means no such file, which the route turns into a 404.
export async function issueEntries(name) {
  const chunk = parseIssueChunkName(name);
  if (chunk == null) return null;
  const { data, error } = await getServiceClient()
    .from("sitemap_issue_chunks")
    .select("gcd_ids")
    .eq("chunk", chunk)
    .maybeSingle();
  if (error) throw error;
  return data ? issueEntriesFromIds(data.gcd_ids, SITE_URL) : null;
}
