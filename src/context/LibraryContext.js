"use client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { trackEvent } from "@/lib/analytics";

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
  const [loadError, setLoadError] = useState(null);

  async function refreshLibrary() {
    if (!user?.id) {
      setCollections([]);
      setLoading(false);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const supabase = getSupabaseClient();

      // Hard timeout — prevents silent infinite spinner if Supabase hangs.
      // 30s is generous but Supabase free-tier cold starts can take 15s+;
      // anything past 30 means there's a real problem worth surfacing.
      const queryPromise = supabase
        .from("user_collections")
        .select("*")
        .eq("user_id", user.id);

      // Bumped 30s → 60s alongside the login bump. Supabase Auth/PostgREST
      // has been responding slowly even though direct DB queries via the
      // service role are fast. Revert once that stabilizes.
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase didn't respond in 60s")), 60000)
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        console.error("refreshLibrary error", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setCollections([]);
        setLoadError(error.message || "Failed to load library");
        return;
      }

      setCollections(data ?? []);
    } catch (err) {
      console.error("refreshLibrary crashed:", err);
      setCollections([]);
      setLoadError(err?.message || "Failed to load library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Clear immediately on user change so a previous account's collections
    // never paint under a new session. Without this, collections from the
    // signed-out user linger until refreshLibrary resolves.
    setCollections([]);
    setLoading(true);
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
        (payload) => {
          setCollections((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new;
              if (prev.some((c) => c.id === row.id)) return prev;
              // Replace any optimistic placeholder for the same library item
              // (matched by gcd_issue_id or comic_id) so we don't end up with
              // both an optimistic row and a realtime-inserted row.
              const filtered = prev.filter((c) => {
                if (typeof c.id === "string" && c.id.startsWith("optimistic-")) {
                  if (row.gcd_issue_id != null && c.gcd_issue_id === row.gcd_issue_id) return false;
                  if (row.comic_id != null && c.comic_id === row.comic_id) return false;
                }
                return true;
              });
              return [...filtered, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new;
              return prev.map((c) => (c.id === row.id ? { ...c, ...row } : c));
            }
            if (payload.eventType === "DELETE") {
              const oldId = payload.old?.id;
              if (oldId == null) return prev;
              return prev.filter((c) => c.id !== oldId);
            }
            return prev;
          });
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

    // Give the optimistic row a temp id so realtime INSERT dedup works.
    // Without it, payload.new.id (real uuid) doesn't match the optimistic
    // row's missing id, and realtime appends a duplicate before refreshLibrary
    // reconciles. We strip the temp prefix server-side; only the local state
    // ever sees this id.
    const optimisticId = `optimistic-${libraryKey}-${Date.now()}`;
    const optimisticRow = {
      id: optimisticId,
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

  // Named collection_add (not "first_"), fired on every add — GA4 can
  // derive first-occurrence in reporting from the raw event stream. A
  // literal "first" name here would be misleading since this fires on
  // every add, not just the first ever.
  trackEvent("collection_add", { status });
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

  // Add an additional copy of an issue already (or not yet) in the collection.
  // Unlike addToCollection which dedupes by (user, gcd_issue_id), this always
  // inserts a NEW row. Auto-increments copy_number based on existing copies
  // sharing the same (user, gcd_issue_id, variant_label). Variant label
  // defaults to null (= same printing as base entry).
  async function addAnotherCopy(inputId, { variant_label = null } = {}) {
    if (!user?.id) return;
    const { comic_id, gcd_issue_id } = parseLibraryInput(inputId);
    const supabase = getSupabaseClient();

    // Find existing copies to determine next copy_number.
    let query = supabase
      .from("user_collections")
      .select("copy_number")
      .eq("user_id", user.id);
    if (gcd_issue_id != null) query = query.eq("gcd_issue_id", gcd_issue_id);
    else if (comic_id != null) query = query.eq("comic_id", comic_id);
    if (variant_label) query = query.eq("variant_label", variant_label);
    else query = query.is("variant_label", null);

    const { data: existing } = await query;
    const maxCopy = (existing ?? []).reduce(
      (m, r) => Math.max(m, Number(r.copy_number) || 1),
      0
    );
    const nextCopy = maxCopy + 1;

    const { error } = await supabase.from("user_collections").insert({
      user_id: user.id,
      status: "owned",
      comic_id: comic_id ?? null,
      gcd_issue_id: gcd_issue_id ?? null,
      variant_label,
      copy_number: nextCopy,
    });
    if (error) {
      console.error("addAnotherCopy failed", error);
      return;
    }
    await refreshLibrary();
  }

  return (
    <LibraryContext.Provider
      value={{
        loading,
        loadError,
        collections,
        collectionIds,
        wishlistIds,
        addToCollection,
        addAnotherCopy,
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