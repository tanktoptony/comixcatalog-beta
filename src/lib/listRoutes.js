import { revalidatePath } from "next/cache";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ownedList(db, id, userId) {
  // A malformed id would make Postgres throw (22P02) and turn a 404 into a 500.
  if (!UUID.test(String(id ?? ""))) return null;

  const { data, error } = await db
    .from("collector_lists")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function resolveBaseIssue(db, value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { data, error } = await db
    .from("gcd_issues")
    .select("gcd_id,base_gcd_issue_id")
    .eq("gcd_id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? Number(data.base_gcd_issue_id || data.gcd_id) : null;
}

export async function bumpAndRevalidate(db, list) {
  const updated_at = new Date().toISOString();
  const { error } = await db
    .from("collector_lists")
    .update({ updated_at })
    .eq("id", list.id);

  if (error) throw error;

  if (list.username) {
    revalidatePath(`/u/${list.username}/lists/${list.slug}`);
  }
  revalidatePath("/lists");
}
