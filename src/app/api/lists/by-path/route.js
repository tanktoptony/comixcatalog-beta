import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getListPage } from "@/lib/listsData";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username")?.trim();
    const slug = searchParams.get("slug")?.trim();
    if (!username || !slug) return jsonError("List path is required.", 400);

    const data = await getListPage(username, slug, user.id);
    if (!data || data.owner.id !== user.id) {
      return jsonError("List not found.", 404);
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("GET /api/lists/by-path failed:", error);
    return jsonError("Could not load list.", 500);
  }
}
