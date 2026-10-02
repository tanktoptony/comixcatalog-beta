// Seller photos of an exact copy (Marketplace v2 Phase 1). Pure rules and
// paths, shared by the upload routes and the uploader, covered by tests.
//
// Flow: the browser asks /api/listings/photos/upload-url for a signed
// upload slot in the PRIVATE originals bucket and uploads straight to it
// (Vercel caps function bodies at 4.5 MB, phone photos are bigger). Then
// /api/listings/photos/process re-encodes it server-side (rotate, strip all
// metadata including GPS, cap at 1600px, WebP) into the PUBLIC bucket with a
// 400px thumb, records a listing_photos row, and deletes the original.
// Photos belong to the copy (collection_id), so they survive unlist/relist.

export const ORIGINALS_BUCKET = "listing-photo-originals";
export const PHOTOS_BUCKET = "listing-photos";

export const PHOTO_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  perCopy: 10,
  perUser: 200,
  perDay: 50,
  longEdge: 1600,
  thumbWidth: 400,
};

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_KINDS = ["front", "back", "spine", "interior", "defect", "slab_label", "other"];
export const KIND_LABELS = {
  front: "Front",
  back: "Back",
  spine: "Spine",
  interior: "Interior",
  defect: "Defect",
  slab_label: "Slab label",
  other: "Other",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v ?? ""));

// The upload-url request: { collectionId, contentType, size }.
// Returns { error } or {} when it's fine. Quotas are checked by the route
// against counts it reads; pass them in so the rule lives here.
export function checkUploadRequest(body, counts = {}) {
  const b = body && typeof body === "object" ? body : {};
  if (!isUuid(b.collectionId)) return { error: "Pick a book from your collection first." };
  const type = String(b.contentType ?? "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") {
    return { error: "That's an iPhone HEIC photo. Upload it from your phone's browser, or save it as a JPEG first." };
  }
  if (!PHOTO_TYPES.includes(type)) return { error: "Photos need to be JPEG, PNG or WebP." };
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) return { error: "That file looks empty." };
  if (size > PHOTO_LIMITS.maxBytes) return { error: "That photo is over 15 MB. Try a smaller one." };
  if ((counts.copy ?? 0) >= PHOTO_LIMITS.perCopy) return { error: `That's the max of ${PHOTO_LIMITS.perCopy} photos for one book.` };
  if ((counts.user ?? 0) >= PHOTO_LIMITS.perUser) return { error: `You've hit the ${PHOTO_LIMITS.perUser}-photo limit. Delete some old ones to add more.` };
  if ((counts.today ?? 0) >= PHOTO_LIMITS.perDay) return { error: `That's ${PHOTO_LIMITS.perDay} photos today. More tomorrow.` };
  return {};
}

export function originalPath(ownerId, uploadId) {
  return `o/${ownerId}/${uploadId}`;
}

// The process route only touches an original the caller uploaded.
export function ownsOriginal(path, ownerId) {
  const m = String(path ?? "").match(/^o\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i);
  return Boolean(m && m[1].toLowerCase() === String(ownerId).toLowerCase() && isUuid(m[2]));
}

// Never reused (a new id per photo), so the CDN can cache them for a year.
export function photoPaths(ownerId, collectionId, photoId) {
  const base = `l/${ownerId}/${collectionId}/${photoId}`;
  return { full: `${base}.webp`, thumb: `${base}.thumb.webp` };
}

export function photoUrl(path, supabaseUrl) {
  return path ? `${supabaseUrl}/storage/v1/object/public/${PHOTOS_BUCKET}/${path}` : null;
}

// New order from a list of ids: every id must already belong to the copy,
// each exactly once. Returns [{ id, sort_order }] or { error }.
export function reorder(currentIds, requestedIds) {
  const cur = new Set(currentIds);
  const req = Array.isArray(requestedIds) ? requestedIds : [];
  if (req.length !== cur.size || new Set(req).size !== req.length || !req.every((id) => cur.has(id))) {
    return { error: "That order doesn't match this book's photos." };
  }
  return req.map((id, i) => ({ id, sort_order: i }));
}
