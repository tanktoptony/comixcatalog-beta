"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/apiClient";
import { ORIGINALS_BUCKET, PHOTO_KINDS, KIND_LABELS, PHOTO_LIMITS, checkUploadRequest, photoUrl } from "@/lib/listingPhotos";

// Seller photos of one copy, inside the listing editor. Upload (several at
// once, or the phone camera), label, reorder (first = lead photo), delete.
// Uploads go browser -> private bucket via a signed slot, then the server
// processes them (src/lib/listingPhotos.js has the whole flow).

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function api(url, options) {
  const res = await authedFetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function PhotoManager({ collectionId }) {
  const [photos, setPhotos] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const fetchPhotos = useCallback(
    () =>
      getSupabaseClient()
        .from("listing_photos")
        .select("id, kind, sort_order, storage_path, thumb_path")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: true }),
    [collectionId]
  );
  const apply = useCallback(({ data, error: err }) => {
    if (err) {
      console.error("Loading photos failed:", err);
      setError("Couldn't load your photos.");
      setPhotos([]);
      return;
    }
    setPhotos((data ?? []).map((p) => ({ ...p, thumbUrl: photoUrl(p.thumb_path, BASE) })));
  }, []);
  const load = useCallback(() => fetchPhotos().then(apply), [fetchPhotos, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchPhotos().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPhotos, apply]);

  async function upload(files) {
    const list = [...files];
    if (!list.length) return;
    setBusy(true);
    setError("");
    let done = 0;
    for (const file of list) {
      setStatus(`Uploading ${done + 1} of ${list.length}…`);
      try {
        const pre = checkUploadRequest({ collectionId, contentType: file.type, size: file.size }, { copy: (photos?.length ?? 0) + done });
        if (pre.error) throw new Error(pre.error);
        const slot = await api("/api/listings/photos/upload-url", {
          method: "POST",
          body: JSON.stringify({ collectionId, contentType: file.type, size: file.size }),
        });
        const { error: upErr } = await getSupabaseClient()
          .storage.from(ORIGINALS_BUCKET)
          .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
        if (upErr) throw new Error("The upload didn't go through. Check your connection and try again.");
        setStatus(`Processing ${done + 1} of ${list.length}…`);
        const kind = (photos?.length ?? 0) + done === 0 ? "front" : "other";
        await api("/api/listings/photos/process", {
          method: "POST",
          body: JSON.stringify({ path: slot.path, collectionId, kind }),
        });
        done += 1;
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
        break;
      }
    }
    setStatus("");
    setBusy(false);
    if (input.current) input.current.value = "";
    await load();
  }

  async function relabel(id, kind) {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, kind } : p)));
    try {
      await api(`/api/listings/photos/${id}`, { method: "PATCH", body: JSON.stringify({ kind }) });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  async function move(index, delta) {
    const next = photos.slice();
    const [p] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, p);
    setPhotos(next);
    try {
      await api("/api/listings/photos/order", { method: "PATCH", body: JSON.stringify({ collectionId, ids: next.map((x) => x.id) }) });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this photo?")) return;
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    try {
      await api(`/api/listings/photos/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err.message);
    }
    load();
  }

  const full = (photos?.length ?? 0) >= PHOTO_LIMITS.perCopy;

  return (
    <div className="pm">
      <div className="pm-head">
        <span>Photos</span>
        <small>
          {photos ? `${photos.length} of ${PHOTO_LIMITS.perCopy}` : ""} · Front, back, spine and any defects sell books.
        </small>
      </div>

      {photos && photos.length > 0 && (
        <ul className="pm-grid">
          {photos.map((p, i) => (
            <li key={p.id} className="pm-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt={KIND_LABELS[p.kind] ?? "Photo"} />
              {i === 0 && <span className="pm-lead">Lead</span>}
              <select value={p.kind ?? "other"} onChange={(e) => relabel(p.id, e.target.value)} aria-label="Photo label">
                {PHOTO_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <div className="pm-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="Move earlier">
                  ←
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || busy} aria-label="Move later">
                  →
                </button>
                <button type="button" onClick={() => remove(p.id)} disabled={busy} aria-label="Delete photo" className="pm-del">
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className={`pm-add${full || busy ? " is-off" : ""}`}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          multiple
          disabled={full || busy}
          onChange={(e) => upload(e.target.files)}
        />
        {busy ? status : full ? "Photo limit reached" : "+ Add photos"}
      </label>
      {error && <p className="pm-error" role="alert">{error}</p>}
    </div>
  );
}
