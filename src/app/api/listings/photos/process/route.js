import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthedUser } from "@/lib/authServer";
import { ORIGINALS_BUCKET, PHOTOS_BUCKET, PHOTO_KINDS, PHOTO_LIMITS, ownsOriginal, photoPaths, photoUrl } from "@/lib/listingPhotos";
import { adminClient, ownedCopy, photoCounts } from "@/lib/listingPhotosServer";
import { revalidateListings } from "@/lib/marketplace";
import { encodePhoto } from "@/lib/photoEncode";

export const maxDuration = 60;

// POST /api/listings/photos/process  { path, collectionId, kind }
// Re-encodes an uploaded original into the public bucket (1600px WebP +
// 400px thumb, never-reused paths), records the listing_photos row, and
// deletes the original.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to add photos." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { path, collectionId } = body ?? {};
  const kind = PHOTO_KINDS.includes(body?.kind) ? body.kind : "other";
  if (!ownsOriginal(path, user.id)) return NextResponse.json({ error: "That upload isn't yours." }, { status: 403 });

  const sb = adminClient();
  const dropOriginal = () => sb.storage.from(ORIGINALS_BUCKET).remove([path]).catch(() => {});
  let written = [];
  try {
    if (!(await ownedCopy(sb, collectionId, user.id))) {
      await dropOriginal();
      return NextResponse.json({ error: "That book isn't in your collection." }, { status: 404 });
    }
    const counts = await photoCounts(sb, user.id, collectionId);
    if (counts.copy >= PHOTO_LIMITS.perCopy) {
      await dropOriginal();
      return NextResponse.json({ error: `That's the max of ${PHOTO_LIMITS.perCopy} photos for one book.` }, { status: 429 });
    }

    const { data: blob, error: dlError } = await sb.storage.from(ORIGINALS_BUCKET).download(path);
    if (dlError) throw dlError;
    const input = Buffer.from(await blob.arrayBuffer());
    if (input.length > PHOTO_LIMITS.maxBytes) {
      await dropOriginal();
      return NextResponse.json({ error: "That photo is over 15 MB." }, { status: 400 });
    }

    let encoded;
    try {
      encoded = await encodePhoto(input);
    } catch {
      await dropOriginal();
      return NextResponse.json({ error: "Couldn't read that image. Try a JPEG or PNG." }, { status: 400 });
    }

    const photoId = randomUUID();
    const paths = photoPaths(user.id, collectionId, photoId);
    const bucket = sb.storage.from(PHOTOS_BUCKET);
    const opts = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
    for (const [p, buf] of [[paths.full, encoded.full.data], [paths.thumb, encoded.thumb]]) {
      const { error } = await bucket.upload(p, buf, opts);
      if (error) throw error;
      written.push(p);
    }

    const { data: listing, error: lError } = await sb
      .from("listings")
      .select("id")
      .eq("collection_id", collectionId)
      .in("status", ["draft", "active", "reserved"])
      .maybeSingle();
    if (lError) throw lError;

    const row = {
      id: photoId,
      listing_id: listing?.id ?? null,
      collection_id: collectionId,
      owner_id: user.id,
      storage_path: paths.full,
      thumb_path: paths.thumb,
      width: encoded.full.info.width,
      height: encoded.full.info.height,
      bytes: encoded.full.info.size,
      kind,
      sort_order: counts.copy,
    };
    const { error: insError } = await sb.from("listing_photos").insert(row);
    if (insError) throw insError;
    written = [];
    await dropOriginal();
    revalidateListings();

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return NextResponse.json({
      photo: {
        id: photoId,
        kind,
        sort_order: row.sort_order,
        url: photoUrl(paths.full, base),
        thumbUrl: photoUrl(paths.thumb, base),
        width: row.width,
        height: row.height,
        bytes: row.bytes,
      },
    });
  } catch (err) {
    console.error("photo process failed:", err);
    if (written.length) await sb.storage.from(PHOTOS_BUCKET).remove(written).catch(() => {});
    await dropOriginal();
    return NextResponse.json({ error: "Couldn't save that photo. Please try again." }, { status: 500 });
  }
}
