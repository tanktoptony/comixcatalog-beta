"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { MOCK_ITEMS } from "@/data/mockCatalog";

export default function ComicDetailPage() {
  const { id } = useParams();
  const { collectionIds, wishlistIds, addToCollection, removeFromCollection } =
    useLibrary();

  const [comic, setComic] = useState(null);
  const [loading, setLoading] = useState(true);

  const safeCollectionIds = Array.isArray(collectionIds) ? collectionIds : [];
  const safeWishlistIds = Array.isArray(wishlistIds) ? wishlistIds : [];

  const inCollection = safeCollectionIds.includes(id);
  const inWishlist = safeWishlistIds.includes(id);

  useEffect(() => {
    if (!id) return;

    async function loadComic() {
      setLoading(true);

      // ===============================
      // MOCK COMICS (UNCHANGED)
      // ===============================
      const mockComic = MOCK_ITEMS.find((c) => String(c.id) === String(id));

      if (mockComic) {
        setComic({
          ...mockComic,
          cover: mockComic.cover ? `/covers/${mockComic.cover}` : null,
        });
        setLoading(false);
        return;
      }

      // ===============================
      // SUPABASE COMICS — SAME AS SEARCH
      // ===============================
      const res = await fetch("/api/comics");
      const data = await res.json();

      const found = data.comics?.find((c) => String(c.id) === String(id));

      if (!found) {
        setComic(null);
        setLoading(false);
        return;
      }

      setComic({
        id: found.id,
        title: found.series_title,
        issueNumber: found.issue_number,
        year: found.release_year,
        cover: found.cover_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${found.cover_path}`
          : null,
      });

      setLoading(false);
    }

    loadComic();
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (!comic) return <p>Comic not found.</p>;

  return (
    <main>
      <h1>
        {comic.title}
        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
      </h1>

      {comic.cover && (
        <img src={comic.cover} alt={comic.title} style={{ maxWidth: 300 }} />
      )}

      <div style={{ marginTop: 16 }}>
        {!inCollection && !inWishlist && (
          <>
            <button onClick={() => addToCollection(String(id), "owned")}>
              Add to Collection
            </button>
            <button
              onClick={() => addToCollection(String(id), "wishlist")}
              style={{ marginLeft: 8 }}
            >
              Add to Wishlist
            </button>
          </>
        )}

        {(inCollection || inWishlist) && (
          <button
            onClick={() => removeFromCollection(String(id))}
            style={{ marginLeft: 8 }}
          >
            Remove
          </button>
        )}
      </div>
    </main>
  );
}