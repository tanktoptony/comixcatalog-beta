import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { planAdd, nextCopyNumber } from "@/lib/libraryMutations";
import { scanDetailsPayload, BULK_ADD_BATCH_SIZE } from "@/lib/scanBulk";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to add books." }, { status: 401 });
  const body = await req.json();
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > BULK_ADD_BATCH_SIZE) {
    return NextResponse.json({ error: `Send between 1 and ${BULK_ADD_BATCH_SIZE} books.` }, { status: 400 });
  }
  const supabase = getServiceClient();
  const added = [], skipped = [];
  for (const input of body.items) {
    const issueId = Number(input.gcd_issue_id);
    if (!Number.isInteger(issueId) || !["owned", "wishlist"].includes(input.status)) {
      skipped.push(input.client_id); continue;
    }
    // A user may replace the vision candidates with a normal catalog search
    // result. The issue therefore does not have to be present in candidates;
    // scan ownership is enforced when the choice is recorded below.
    const { data: existing, error: readError } = await supabase.from("user_collections").select("id, status, copy_number, variant_label").eq("user_id", user.id).eq("gcd_issue_id", issueId);
    if (readError) return NextResponse.json({ error: "Could not check your collection." }, { status: 500 });
    const details = scanDetailsPayload(input);
    let result;
    if (input.another_copy && input.status === "owned") {
      result = await supabase.from("user_collections").insert({ user_id: user.id, gcd_issue_id: issueId, comic_id: null, status: "owned", copy_number: nextCopyNumber(existing ?? [], null), ...details }).select("id").single();
    } else {
      const plan = planAdd(existing ?? [], { status: input.status });
      if (plan.inserts.length) result = await supabase.from("user_collections").insert({ user_id: user.id, gcd_issue_id: issueId, comic_id: null, ...plan.inserts[0], ...details }).select("id").single();
      else if (plan.updates.length) result = await supabase.from("user_collections").update({ ...plan.updates[0].patch, ...details }).eq("id", plan.updates[0].id).eq("user_id", user.id).select("id").single();
      else { skipped.push(input.client_id); continue; }
      if (!result.error && plan.deletes.length) await supabase.from("user_collections").delete().eq("user_id", user.id).in("id", plan.deletes);
    }
    if (result?.error) {
      console.error("cover scan collection add failed", result.error);
      return NextResponse.json({ error: "Could not add every book. Your completed adds were kept.", added, skipped }, { status: 500 });
    }
    if (input.scan_id) await supabase.from("cover_scans").update({ chosen_gcd_issue_id: issueId }).eq("id", input.scan_id).eq("user_id", user.id);
    added.push({ client_id: input.client_id, collection_id: result.data.id });
  }
  return NextResponse.json({ added, skipped });
}
