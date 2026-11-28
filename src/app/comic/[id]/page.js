import { permanentRedirect } from "next/navigation";
import ComicClient from "./ComicClient";
import { getServiceClient } from "@/lib/supabase/service";

async function linkedGcdIssueId(comicId) {
  const supabase = getServiceClient();
  const { data: comic, error: comicError } = await supabase
    .from("comics")
    .select("gcd_id")
    .eq("id", comicId)
    .maybeSingle();
  if (comicError) {
    console.error("comic redirect lookup failed:", comicError.code, comicError.message);
    return null;
  }

  const gcdId = Number(comic?.gcd_id);
  if (!Number.isInteger(gcdId) || gcdId <= 0) return null;

  const { data: issue, error: issueError } = await supabase
    .from("gcd_issues")
    .select("gcd_id")
    .eq("gcd_id", gcdId)
    .maybeSingle();
  if (issueError) {
    console.error("comic redirect target lookup failed:", issueError.code, issueError.message);
    return null;
  }
  return issue?.gcd_id == null ? null : Number(issue.gcd_id);
}

export default async function ComicPage({ params }) {
  const { id } = await params;
  const gcdIssueId = await linkedGcdIssueId(id);
  if (gcdIssueId != null) permanentRedirect(`/issue/gcd-${gcdIssueId}`);
  return <ComicClient />;
}
