import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthedUser } from "@/lib/authServer";
import { ORIGINALS_BUCKET, checkUploadRequest, originalPath } from "@/lib/listingPhotos";
import { adminClient, ownedCopy, photoCounts } from "@/lib/listingPhotosServer";

// POST /api/listings/photos/upload-url  { collectionId, contentType, size }
// Hands back a one-time signed slot in the private originals bucket after
// checking ownership, type, size and quotas. The browser uploads straight
// to storage, then calls /api/listings/photos/process.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to add photos." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const pre = checkUploadRequest(body);
  if (pre.error) return NextResponse.json({ error: pre.error }, { status: 400 });

  const sb = adminClient();
  try {
    if (!(await ownedCopy(sb, body.collectionId, user.id))) {
      return NextResponse.json({ error: "That book isn't in your collection." }, { status: 404 });
    }
    const quota = checkUploadRequest(body, await photoCounts(sb, user.id, body.collectionId));
    if (quota.error) return NextResponse.json({ error: quota.error }, { status: 429 });

    const path = originalPath(user.id, randomUUID());
    const { data, error } = await sb.storage.from(ORIGINALS_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ path: data.path, token: data.token });
  } catch (err) {
    console.error("photo upload-url failed:", err);
    return NextResponse.json({ error: "Couldn't start the upload. Please try again." }, { status: 500 });
  }
}
