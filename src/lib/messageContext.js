const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function validateMessageContext(supabase, about, senderId, recipientId) {
  if (about == null) return { gcd_issue_id: null, collection_id: null };
  if (!about || typeof about !== "object" || Array.isArray(about)) return null;

  let gcdIssueId = about.gcd_issue_id;
  const collectionId = about.collection_id;
  if (gcdIssueId != null && (!Number.isInteger(gcdIssueId) || gcdIssueId <= 0)) return null;
  if (collectionId != null && (typeof collectionId !== "string" || !UUID.test(collectionId))) return null;
  if (gcdIssueId == null && collectionId == null) return null;

  if (collectionId) {
    const { data, error } = await supabase
      .from("user_collections")
      .select("user_id,gcd_issue_id")
      .eq("id", collectionId)
      .maybeSingle();
    if (error || !data || ![senderId, recipientId].includes(data.user_id)) return null;
    if (gcdIssueId == null) gcdIssueId = Number(data.gcd_issue_id);
  }

  if (!Number.isInteger(gcdIssueId) || gcdIssueId <= 0) return null;
  const { data: issue, error: issueError } = await supabase
    .from("gcd_issues")
    .select("gcd_id")
    .eq("gcd_id", gcdIssueId)
    .maybeSingle();
  if (issueError || !issue) return null;
  return { gcd_issue_id: gcdIssueId, collection_id: collectionId ?? null };
}
