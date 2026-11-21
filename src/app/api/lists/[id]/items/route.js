import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import {
  bumpAndRevalidate,
  ownedList,
  resolveBaseIssue,
} from "@/lib/listRoutes";
import { MAX_ITEMS_PER_LIST, reorder, validateNote } from "@/lib/lists";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

async function requestContext(req, params) {
  const user = await getAuthedUser(req);
  if (!user) return { response: jsonError("Unauthorized", 401) };

  const { id } = await params;
  const db = getServiceClient();
  const list = await ownedList(db, id, user.id);
  if (!list) return { response: jsonError("List not found.", 404) };
  return { db, list };
}

async function loadItems(db, listId) {
  const { data, error } = await db
    .from("collector_list_items")
    .select("*")
    .eq("list_id", listId)
    .order("position")
    .range(0, 499);

  if (error) throw error;
  return data ?? [];
}

export async function POST(req, { params }) {
  try {
    const context = await requestContext(req, params);
    if (context.response) return context.response;

    const body = await req.json().catch(() => null);
    const note = validateNote(body?.note);
    if (note.error) return jsonError(note.error, 400);

    const baseIssueId = await resolveBaseIssue(context.db, body?.issue);
    if (!baseIssueId) return jsonError("Issue not found.", 404);

    const items = await loadItems(context.db, context.list.id);
    if (
      items.some(
        (item) => Number(item.base_gcd_issue_id) === baseIssueId
      )
    ) {
      return jsonError("That book is already on this list.", 409);
    }
    if (items.length >= MAX_ITEMS_PER_LIST) {
      return jsonError("This list already has 500 books.", 409);
    }

    const item = {
      list_id: context.list.id,
      base_gcd_issue_id: baseIssueId,
      position: items.length,
      note: note.value,
    };
    const { data, error } = await context.db
      .from("collector_list_items")
      .insert(item)
      .select("*")
      .single();

    if (error) throw error;
    await bumpAndRevalidate(context.db, context.list);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("POST list item failed:", error);
    return jsonError("Could not add book.", 500);
  }
}

export async function PATCH(req, { params }) {
  try {
    const context = await requestContext(req, params);
    if (context.response) return context.response;

    const body = await req.json().catch(() => null);
    const baseIssueId = await resolveBaseIssue(context.db, body?.issue);
    if (!baseIssueId) return jsonError("Issue not found.", 404);

    let items = await loadItems(context.db, context.list.id);
    if (
      !items.some(
        (item) => Number(item.base_gcd_issue_id) === baseIssueId
      )
    ) {
      return jsonError("Book not found on this list.", 404);
    }

    if (Object.hasOwn(body ?? {}, "note")) {
      const note = validateNote(body.note);
      if (note.error) return jsonError(note.error, 400);

      const { error } = await context.db
        .from("collector_list_items")
        .update({ note: note.value })
        .eq("list_id", context.list.id)
        .eq("base_gcd_issue_id", baseIssueId);

      if (error) throw error;
    }

    if (Object.hasOwn(body ?? {}, "toIndex")) {
      items = reorder(items, baseIssueId, body.toIndex);
      const { error } = await context.db.from("collector_list_items").upsert(
        items.map((item) => ({
          list_id: context.list.id,
          base_gcd_issue_id: item.base_gcd_issue_id,
          position: item.position,
          note: item.note,
          added_at: item.added_at,
        }))
      );

      if (error) throw error;
    }

    await bumpAndRevalidate(context.db, context.list);
    return NextResponse.json({ items: await loadItems(context.db, context.list.id) });
  } catch (error) {
    console.error("PATCH list item failed:", error);
    return jsonError("Could not update book.", 500);
  }
}

export async function DELETE(req, { params }) {
  try {
    const context = await requestContext(req, params);
    if (context.response) return context.response;

    const issueId = Number(new URL(req.url).searchParams.get("issue"));
    if (!Number.isInteger(issueId)) {
      return jsonError("Issue is required.", 400);
    }

    const { error } = await context.db
      .from("collector_list_items")
      .delete()
      .eq("list_id", context.list.id)
      .eq("base_gcd_issue_id", issueId);

    if (error) throw error;

    const compacted = reorder(
      await loadItems(context.db, context.list.id),
      -1,
      0
    );
    if (compacted.length) {
      const result = await context.db
        .from("collector_list_items")
        .upsert(compacted);
      if (result.error) throw result.error;
    }

    await bumpAndRevalidate(context.db, context.list);
    return NextResponse.json({ items: compacted });
  } catch (error) {
    console.error("DELETE list item failed:", error);
    return jsonError("Could not remove book.", 500);
  }
}
