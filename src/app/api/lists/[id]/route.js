import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { ownedList } from "@/lib/listRoutes";
import { validateListInput } from "@/lib/lists";
import { getServiceClient } from "@/lib/supabase/service";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const { id } = await params;
    const db = getServiceClient();
    const list = await ownedList(db, id, user.id);
    if (!list) return jsonError("List not found.", 404);

    const body = await req.json().catch(() => null);
    const checked = validateListInput(body, { partial: true });
    if (checked.error) return jsonError(checked.error, 400);

    const { data, error } = await db
      .from("collector_lists")
      .update({ ...checked.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    revalidatePath("/lists");
    return NextResponse.json({ list: data });
  } catch (error) {
    console.error("PATCH /api/lists/[id] failed:", error);
    return jsonError("Could not update list.", 500);
  }
}

export async function DELETE(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  try {
    const { id } = await params;
    const db = getServiceClient();
    const list = await ownedList(db, id, user.id);
    if (!list) return jsonError("List not found.", 404);

    const { error } = await db.from("collector_lists").delete().eq("id", id);
    if (error) throw error;

    revalidatePath("/lists");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/lists/[id] failed:", error);
    return jsonError("Could not delete list.", 500);
  }
}
