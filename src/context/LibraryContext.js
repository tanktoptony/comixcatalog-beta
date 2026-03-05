"use client";
import { getSupabaseClient } from "@/lib/supabase/client";

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
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("user_collections")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("refreshLibrary error:", error);
      setCollections([]);
      return;
    }

    console.log("RAW COLLECTIONS:", data);

    setCollections(data ?? []);
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    refreshLibrary();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = getSupabaseClient();

    const channel = supabase
      .channel("library-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_collections",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refreshLibrary();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

    // 🔥 optimistic UI update
    setCollections((prev) => {
      const filtered = prev.filter((c) => String(c.comic_id) !== String(comic_id));
      return [...filtered, { comic_id, status, user_id: user.id }];
    });

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("user_collections")
      .upsert(
        { comic_id, status, user_id: user.id },
        { onConflict: "user_id,comic_id" }
      );

    if (error) {
      console.error(error);
      await refreshLibrary(); // fallback sync
    }
  }


  async function removeFromCollection(comic_id) {
    if (!user?.id) return;

    // 🔥 optimistic UI update
    setCollections((prev) =>
      prev.filter((c) => String(c.comic_id) !== String(comic_id))
    );

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("user_collections")
      .delete()
      .eq("comic_id", comic_id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      await refreshLibrary();
    }
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
