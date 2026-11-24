import { coverThumb as loadCover } from "./loadCollection.js";

export async function loadListCard(supabase, userId, searchParams) {
  const listId = searchParams?.get("list");
  if (!listId) return { found: false, covers: [] };

  const [listResult, profileResult] = await Promise.all([
    supabase
      .from("collector_lists")
      .select("id,title,user_id")
      .eq("id", listId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("username").eq("id", userId).single(),
  ]);

  if (listResult.error || profileResult.error) {
    throw listResult.error || profileResult.error;
  }
  if (!listResult.data) return { found: false, covers: [] };

  const { data: items, error: itemError } = await supabase
    .from("collector_list_items")
    .select("base_gcd_issue_id,position")
    .eq("list_id", listId)
    .order("position")
    .range(0, 499);

  if (itemError) throw itemError;

  const firstItems = (items ?? []).slice(0, 9);
  const issueIds = firstItems.map((row) => row.base_gcd_issue_id);
  const coverResult = issueIds.length
    ? await supabase
        .from("canonical_covers")
        .select("gcd_issue_id,storage_path")
        .in("gcd_issue_id", issueIds)
        .range(0, 199)
    : { data: [], error: null };

  if (coverResult.error) throw coverResult.error;

  const pathByIssue = new Map(
    (coverResult.data ?? []).map((row) => [
      Number(row.gcd_issue_id),
      row.storage_path,
    ])
  );
  const images = (
    await Promise.all(
      firstItems.map((row) => {
        const path = pathByIssue.get(Number(row.base_gcd_issue_id));
        return path ? loadCover(path) : null;
      })
    )
  ).filter(Boolean);

  return {
    found: true,
    title: listResult.data.title,
    username: profileResult.data.username,
    count: items?.length ?? 0,
    covers: images,
  };
}
