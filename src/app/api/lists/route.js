import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { resolveBaseIssue } from "@/lib/listRoutes";
import {
  MAX_LISTS_PER_USER,
  slugify,
  uniqueSlug,
  validateListInput,
} from "@/lib/lists";
import { getUserLists } from "@/lib/listsData";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

async function loadItemSummary(db, listIds, issueId) {
  const rows = [];

  if (listIds.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("collector_list_items")
        .select("list_id")
        .in("list_id", listIds)
        .range(from, from + 999);

      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
  }

  const containingResult =
    Number.isInteger(issueId) && listIds.length
      ? await db
          .from("collector_list_items")
          .select("list_id")
          .in("list_id", listIds)
          .eq("base_gcd_issue_id", issueId)
      : { data: [], error: null };

  if (containingResult.error) throw containingResult.error;

  const counts = new Map();
  for (const row of rows) {
    counts.set(row.list_id, (counts.get(row.list_id) ?? 0) + 1);
  }

  return {
    counts,
    containing: new Set(
      (containingResult.data ?? []).map((row) => row.list_id)
    ),
  };
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("view") === "cards") {
      const lists = await getUserLists(user.id, { includePrivate: true });
      return NextResponse.json(lists, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const db = getServiceClient();
    const { data: lists, error } = await db
      .from("collector_lists")
      .select("id,title,slug,is_public")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(0, 99);

    if (error) throw error;

    const listIds = (lists ?? []).map((row) => row.id);
    const issueId = Number(searchParams.get("issue"));
    const summary = await loadItemSummary(db, listIds, issueId);
    const body = (lists ?? []).map((list) => ({
      ...list,
      item_count: summary.counts.get(list.id) ?? 0,
      has_issue: summary.containing.has(list.id),
    }));

    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("GET /api/lists failed:", error);
    return jsonError("Could not load lists.", 500);
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const body = await req.json().catch(() => null);
    const checked = validateListInput(body);
    if (checked.error) return jsonError(checked.error, 400);

    const db = getServiceClient();
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.username) return jsonError("Pick a username first.", 400);

    const { data: existing, error: listError } = await db
      .from("collector_lists")
      .select("slug")
      .eq("user_id", user.id)
      .range(0, 99);

    if (listError) throw listError;
    if ((existing ?? []).length >= MAX_LISTS_PER_USER) {
      return jsonError(
        "You have 100 lists. Delete one to make another.",
        409
      );
    }

    const slug = uniqueSlug(
      slugify(checked.value.title),
      (existing ?? []).map((row) => row.slug)
    );
    const { data: list, error: insertError } = await db
      .from("collector_lists")
      .insert({ user_id: user.id, ...checked.value, slug })
      .select("*")
      .single();

    if (insertError) throw insertError;

    if (body.issue != null) {
      const baseIssueId = await resolveBaseIssue(db, body.issue);
      if (!baseIssueId) {
        await db.from("collector_lists").delete().eq("id", list.id);
        return jsonError("Issue not found.", 404);
      }

      const { error: itemError } = await db
        .from("collector_list_items")
        .insert({
          list_id: list.id,
          base_gcd_issue_id: baseIssueId,
          position: 0,
        });

      if (itemError) throw itemError;
    }

    return NextResponse.json(
      { list, url: `/u/${profile.username}/lists/${slug}` },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/lists failed:", error);
    return jsonError("Could not create list.", 500);
  }
}
