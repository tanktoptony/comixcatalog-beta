"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const { user } = useAuth();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refreshLibrary() {
    if (!user?.id) {
      setCollections([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/collections?user_id=${user.id}`, {
        cache: "no-store",
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      setCollections(json.collections ?? []);
    } catch (err) {
      console.error(err);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshLibrary();
  }, [user?.id]);

  const collectionIds = useMemo(
    () =>
      new Set(
        collections
          .filter((c) => c.status === "owned")
          .map((c) => String(c.comic_id))
      ),
    [collections]
  );

  const wishlistIds = useMemo(
    () =>
      new Set(
        collections
          .filter((c) => c.status === "wishlist")
          .map((c) => String(c.comic_id))
      ),
    [collections]
  );

  async function addToCollection(comic_id, status) {
    if (!user?.id) return;

    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comic_id,
        status,
        user_id: user.id,
      }),
    });

    await refreshLibrary();
  }

  async function removeFromCollection(comic_id) {
    if (!user?.id) return;

    await fetch("/api/collections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comic_id,
        user_id: user.id,
      }),
    });

    await refreshLibrary();
  }

  return (
    <LibraryContext.Provider
      value={{
        loading,
        collections,
        collectionIds,
        wishlistIds,
        addToCollection,
        removeFromCollection,
        refreshLibrary,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary must be used inside LibraryProvider");
  }
  return ctx;
}
