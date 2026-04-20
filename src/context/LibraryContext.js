"use client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

const LibraryContext = createContext(null);

function makeLibraryKey(item) {
  if (!item) return null;

  if (item.gcd_issue_id != null) {
    return `gcd-${item.gcd_issue_id}`;
  }

  if (item.comic_id != null) {
    return String(item.comic_id);
  }

  return null;
}

function parseLibraryInput(input) {
  const raw = String(input || "").trim();

  if (!raw) {
    return { comic_id: null, gcd_issue_id: null, libraryKey: null };
  }

  const gcdMatch = raw.match(/^gcd-(\d+)$/i);
  if (gcdMatch) {
    return {
      comic_id: null,
      gcd_issue_id: Number(gcdMatch[1]),
      libraryKey: `gcd-${gcdMatch[1]}`,
    };
  }

  return {
    comic_id: raw,
    gcd_issue_id: null,
    libraryKey: raw,
  };
}

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
        console.error("refreshLibrary error", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setCollections([]);
        return;
      }

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
      .channel(`library-changes-${user.id}`)
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
          .map(makeLibraryKey)
          .filter(Boolean)
      ),
    [collections]
  );

  const wishlistIds = useMemo(
    () =>
      new Set(
        collections
          .filter((c) => c.status === "wishlist")
          .map(makeLibraryKey)
          .filter(Boolean)
      ),
    [collections]
  );

  async function addToCollection(inputId, status) {
    if (!user?.id) return;

    const { comic_id, gcd_issue_id, libraryKey } = parseLibraryInput(inputId);
    if (!libraryKey) return;

    const optimisticRow = {
      user_id: user.id,
      status,
      comic_id,
      gcd_issue_id,
    };

    setCollections((prev) => {
      const filtered = prev.filter((c) => makeLibraryKey(c) !== libraryKey);
      return [...filtered, optimisticRow];
    });

    const supabase = getSupabaseClient();

    let error = null;

    if (gcd_issue_id != null) {
      const existingResult = await supabase
        .from("user_collections")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("gcd_issue_id", gcd_issue_id)
        .maybeSingle();

      if (existingResult.error) {
        error = existingResult.error;
      } else if (existingResult.data?.id) {
        const updateResult = await supabase
          .from("user_collections")
          .update({ status })
          .eq("id", existingResult.data.id);

        error = updateResult.error;
      } else {
        const insertResult = await supabase
          .from("user_collections")
          .insert({
            user_id: user.id,
            status,
            comic_id: null,
            gcd_issue_id,
          });

        error = insertResult.error;
      }
    } else {
      const result = await supabase
        .from("user_collections")
        .upsert(
          {
            user_id: user.id,
            status,
            comic_id,
            gcd_issue_id: null,
          },
          { onConflict: "user_id,comic_id" }
        );

      error = result.error;
    }

  if (error) {
    console.error("addToCollection failed", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      inputId,
      comic_id,
      gcd_issue_id,
      status,
      user_id: user.id,
    });
    await refreshLibrary();
    return;
  }

  await refreshLibrary();
}

  async function removeFromCollection(inputId) {
    if (!user?.id) return;

    const { comic_id, gcd_issue_id, libraryKey } = parseLibraryInput(inputId);
    if (!libraryKey) return;

    setCollections((prev) =>
      prev.filter((c) => makeLibraryKey(c) !== libraryKey)
    );

    const supabase = getSupabaseClient();

    let query = supabase
      .from("user_collections")
      .delete()
      .eq("user_id", user.id);

    if (gcd_issue_id != null) {
      query = query.eq("gcd_issue_id", gcd_issue_id);
    } else {
      query = query.eq("comic_id", comic_id);
    }

    const { error } = await query;

    if (error) {
      console.error("removeFromCollection failed", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        inputId,
        comic_id,
        gcd_issue_id,
        user_id: user.id,
      });
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