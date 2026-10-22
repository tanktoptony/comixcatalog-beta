import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { planAdd } from "@/lib/libraryMutations";
import { RUN_QUICK_ADD_LIMIT } from "@/lib/runQuickAdd";
import { getServiceClient } from "@/lib/supabase/service";

// One request for a whole run. Writes are batched (one delete, one update,
// inserts in chunks) rather than one round trip per issue, so 300 issues
// does not mean 600 sequential database calls.
export const maxDuration = 60;
const INSERT_CHUNK = 250;

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in to add books." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (
    !Array.isArray(body.issue_ids) ||
    body.issue_ids.length < 1 ||
    body.issue_ids.length > RUN_QUICK_ADD_LIMIT
  ) {
    return NextResponse.json(
      { error: `Send between 1 and ${RUN_QUICK_ADD_LIMIT} issues.` },
      { status: 400 }
    );
  }

  const issueIds = [...new Set(body.issue_ids.map(Number))];
  if (issueIds.some((issueId) => !Number.isInteger(issueId) || issueId < 1)) {
    return NextResponse.json({ error: "Every issue id must be valid." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: validIssues, error: issueError } = await supabase
    .from("gcd_issues")
    .select("gcd_id")
    .in("gcd_id", issueIds);
  if (issueError) {
    return NextResponse.json({ error: "Could not validate those issues." }, { status: 500 });
  }

  const validIds = new Set((validIssues ?? []).map((row) => Number(row.gcd_id)));
  if (validIds.size !== issueIds.length) {
    return NextResponse.json({ error: "One or more issues were not found." }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("user_collections")
    .select("id, gcd_issue_id, status, created_at")
    .eq("user_id", user.id)
    .in("gcd_issue_id", issueIds);
  if (readError) {
    return NextResponse.json({ error: "Could not check your collection." }, { status: 500 });
  }

  const rowsByIssue = new Map();
  for (const row of existing ?? []) {
    const issueId = Number(row.gcd_issue_id);
    const rows = rowsByIssue.get(issueId) ?? [];
    rows.push(row);
    rowsByIssue.set(issueId, rows);
  }

  const deletes = [];
  const updateIds = [];
  const inserts = [];
  const skipped = [];
  for (const issueId of issueIds) {
    const plan = planAdd(rowsByIssue.get(issueId) ?? [], { status: "owned" });
    deletes.push(...plan.deletes);
    if (plan.updates.length) {
      updateIds.push(plan.updates[0].id);
    } else if (plan.inserts.length) {
      inserts.push({ user_id: user.id, comic_id: null, gcd_issue_id: issueId, ...plan.inserts[0] });
    } else {
      skipped.push(`gcd-${issueId}`);
    }
  }

  const added = [];
  const fail = (step, error) => {
    console.error(`run quick add ${step} failed`, error);
    return NextResponse.json(
      { error: "Could not add every issue. Your completed adds were kept.", added, skipped },
      { status: 500 }
    );
  };

  if (deletes.length) {
    const { error } = await supabase
      .from("user_collections")
      .delete()
      .eq("user_id", user.id)
      .in("id", deletes);
    if (error) return fail("cleanup", error);
  }

  // planAdd only ever updates a wantlist row to owned.
  if (updateIds.length) {
    const { data, error } = await supabase
      .from("user_collections")
      .update({ status: "owned" })
      .eq("user_id", user.id)
      .in("id", updateIds)
      .select("*");
    if (error) return fail("wantlist update", error);
    added.push(...(data ?? []));
  }

  for (let index = 0; index < inserts.length; index += INSERT_CHUNK) {
    const { data, error } = await supabase
      .from("user_collections")
      .insert(inserts.slice(index, index + INSERT_CHUNK))
      .select("*");
    if (error) return fail("insert", error);
    added.push(...(data ?? []));
  }

  return NextResponse.json({ added, skipped });
}
