import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { PHOTOS_BUCKET, PHOTO_KINDS, isUuid } from "@/lib/listingPhotos";
import { adminClient } from "@/lib/listingPhotosServer";
import { revalidateListings } from "@/lib/marketplace";

async function ownPhoto(sb, id, userId) {
  if (!isUuid(id)) return null;
  const { data, error } = await sb.from("listing_photos").select("id, owner_id, storage_path, thumb_path").eq("id", id).maybeSingle();
  if (error) throw error;
  return data && data.owner_id === userId ? data : null;
}

// DELETE /api/listings/photos/:id  removes the photo and its files.
export async function DELETE(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const sb = adminClient();
  try {
    const photo = await ownPhoto(sb, id, user.id);
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    const { error } = await sb.from("listing_photos").delete().eq("id", id);
    if (error) throw error;
    const { error: rmError } = await sb.storage.from(PHOTOS_BUCKET).remove([photo.storage_path, photo.thumb_path]);
    if (rmError) console.error("photo files left behind:", rmError);
    revalidateListings();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("photo delete failed:", err);
    return NextResponse.json({ error: "Couldn't delete that photo." }, { status: 500 });
  }
}

// PATCH /api/listings/photos/:id  { kind }  relabels a photo.
export async function PATCH(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!PHOTO_KINDS.includes(body?.kind)) return NextResponse.json({ error: "Unknown photo label." }, { status: 400 });
  const sb = adminClient();
  try {
    if (!(await ownPhoto(sb, id, user.id))) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    const { error } = await sb.from("listing_photos").update({ kind: body.kind }).eq("id", id);
    if (error) throw error;
    revalidateListings();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("photo relabel failed:", err);
    return NextResponse.json({ error: "Couldn't update that photo." }, { status: 500 });
  }
}
