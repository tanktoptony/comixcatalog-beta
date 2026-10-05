"use client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { trackEvent } from "@/lib/analytics";
import { attributionParams } from "@/lib/attribution";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { readLocal, writeLocal, clearLocalPrefix } from "@/lib/localCache";
import {
  nextCopyNumber,
  planAdd,
  planRemove,
  withKeyLock,
} from "@/lib/libraryMutations";

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
  const { user, loading: authLoading } = useAuth();
  const authSettled = Boolean(user?.id) || !authLoading;
  const [collections, setCollections] = useState([]);
  // Whose list `collections` currently holds. Set in the same batch as
  // every wholesale load, so the browser-cache write below can never save
  // one account's books under another account's key mid-switch.
  const [collectionsOwner, setCollectionsOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // `background`: a copy from this browser's cache is already on screen, so
  // refresh quietly — no spinner, and a failed refresh keeps showing the
  // cached list (logged) instead of blanking it.
  async function refreshLibrary({ background = false } = {}) {
    if (!user?.id) {
      setCollections([]);
      setCollectionsOwner(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    if (!background) setLoading(true);
    setLoadError(null);

    try {
      const supabase = getSupabaseClient();

      // Hard timeout — prevents silent infinite spinner if Supabase hangs.
      // 30s is generous but Supabase free-tier cold starts can take 15s+;
      // anything past 30 means there's a real problem worth surfacing.
      // Paginated: PostgREST silently stops at 1000 rows, which cut off
      // collections past 1,000 books (see src/lib/supabase/fetchAllPages.js).
      const queryPromise = fetchAllPages(() =>
        supabase.from("user_collections").select("*").eq("user_id", user.id)
      ).then(
        (data) => ({ data, error: null }),
        (error) => ({ data: null, error })
      );

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
        if (background) return;
        setCollections([]);
        setCollectionsOwner(null);
        setLoadError(error.message || "Failed to load library");
        return;
      }

      setCollections(data ?? []);
      setCollectionsOwner(user.id);
    } catch (err) {
      console.error("refreshLibrary crashed:", err);
      if (background) return;
      setCollections([]);
      setCollectionsOwner(null);
      setLoadError(err?.message || "Failed to load library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Clear immediately on user change so a previous account's collections
    // never paint under a new session. Without this, collections from the
    // signed-out user linger until refreshLibrary resolves. Genuinely needs
    // to be an effect (not a render-time state sync) since it also kicks
    // off an async refetch — same accepted exception pattern already used
    // elsewhere in this codebase (Header.js, ProfileTabs.js, library/page.js).
    //
    // 2026-10-01: the list is also kept in this browser (src/lib/localCache)
    // so a return visit paints the library immediately from the last copy
    // and refreshes it in the background, instead of a blank "Loading…" on
    // every visit. Signing out wipes those copies, so a shared computer
    // never shows the next person someone else's collection.
    // Wait only until we know who (if anyone) is signed in. AuthContext
    // keeps `loading` true until the profile row also loads; the library
    // does not need it, so a known user id is enough to start.
    if (!authSettled) return;
    if (!user?.id) {
      clearLocalPrefix("library:");
      clearLocalPrefix("hydrate:");
    }
    const cached = user?.id ? readLocal(`library:${user.id}`) : null;
    if (Array.isArray(cached)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollections(cached);
      setCollectionsOwner(user.id);
      setLoading(false);
      refreshLibrary({ background: true });
      return;
    }
    setCollections([]);
    setCollectionsOwner(null);
    setLoading(true);
    refreshLibrary();
  }, [user?.id, authSettled]);

  // Keep the browser copy current with every change: the server refresh,
  // realtime updates, and optimistic adds/removes alike.
  useEffect(() => {
    if (!user?.id || loading || collectionsOwner !== user.id) return;
    writeLocal(`library:${user.id}`, collections);
  }, [collections, collectionsOwner, loading, user?.id]);

  // Other tabs/devices: re-read quietly whenever this tab comes back into
  // view. This replaced a Supabase Realtime postgres_changes subscription
  // (2026-10-01). Every signed-in visitor held one open on every page, and
  // Realtime's change polling was the single largest consumer of database
  // time in pg_stat_statements (~9.6M calls, more than all page queries
  // combined), multiplied by every row the ingest/refresh scripts write.
  // This tab's own adds/removes already update state optimistically and
  // re-read afterwards, so the subscription only ever covered other tabs.
  useEffect(() => {
    if (!user?.id) return;
    function onVisible() {
      if (document.visibilityState === "visible") refreshLibrary({ background: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const collectionIds = useMemo(
    () =>
      new Set(
        collections
          .filter((c) => c.status === "owned" || c.status === "for_sale")
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
    if (!user?.id) return { ok: false, error: "Sign in required" };

    const { comic_id, gcd_issue_id, libraryKey } = parseLibraryInput(inputId);
    if (!libraryKey) return { ok: false, error: "Invalid library item" };

    return withKeyLock(libraryKey, async () => {

    // Give the optimistic row a temporary local ID so the UI can replace the
    // same logical item in one state update without waiting for the server
    // round trip. The persisted row still receives a real UUID from Supabase
    // once the request resolves; this is purely for local deduping.
    // Activation: is this the account's first book with this status? Read
    // before the optimistic insert below, and only once the library has
    // finished loading. An empty array while still loading means "not
    // known yet", not "empty", and would fire a false first-add. Same after
    // a failed load: refreshLibrary sets collections to [] on error, which
    // would make an existing collector's next add look like their first.
    const isFirstOfStatus =
      !loading && !loadError && !collections.some((c) => c.status === status);

    const supabase = getSupabaseClient();
    let error = null;
    let plan = null;

    if (gcd_issue_id != null) {
      const existingResult = await supabase
        .from("user_collections")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .eq("gcd_issue_id", gcd_issue_id);

      if (existingResult.error) {
        error = existingResult.error;
      } else {
        plan = planAdd(existingResult.data ?? [], { status });
        const optimisticNow = new Date().toISOString();
        setCollections((prev) => {
          const keyRows = prev.filter((row) => makeLibraryKey(row) === libraryKey);
          const planned = planAdd(keyRows, { status });
          const deleteIds = new Set(planned.deletes);
          const patches = new Map(planned.updates.map((update) => [update.id, update.patch]));
          const kept = prev
            .filter((row) => !deleteIds.has(row.id))
            .map((row) => patches.has(row.id) ? { ...row, ...patches.get(row.id) } : row);
          const inserted = planned.inserts.map((insert, index) => ({
            id: `optimistic-${libraryKey}-${Date.now()}-${index}`,
            user_id: user.id,
            comic_id: null,
            gcd_issue_id,
            created_at: optimisticNow,
            ...insert,
          }));
          return [...kept, ...inserted];
        });

        for (const update of plan.updates) {
          const result = await supabase
            .from("user_collections")
            .update(update.patch)
            .eq("id", update.id)
            .eq("user_id", user.id)
            .select("id");
          if (result.error) { error = result.error; break; }
          if (!result.data?.length) refreshLibrary({ background: true });
        }
        if (!error && plan.deletes.length) {
          const result = await supabase
            .from("user_collections")
            .delete()
            .eq("user_id", user.id)
            .in("id", plan.deletes);
          error = result.error;
        }
        for (const insert of plan.inserts) {
          if (error) break;
          const result = await supabase
            .from("user_collections")
            .insert({
              user_id: user.id,
              comic_id: null,
              gcd_issue_id,
              ...insert,
            })
            .select("*")
            .single();
          if (result.error?.code === "23505" && insert.status === "wishlist") {
            refreshLibrary({ background: true });
          } else if (result.error) {
            error = result.error;
          } else if (result.data) {
            // Swap the optimistic row for the saved one, so a remove right
            // after this add deletes the real id, not the temporary one.
            const saved = result.data;
            const tempPrefix = `optimistic-${libraryKey}-`;
            setCollections((prev) => {
              const i = prev.findIndex(
                (row) => String(row.id).startsWith(tempPrefix) && row.status === saved.status
              );
              if (i === -1) return [...prev, saved];
              const next = prev.slice();
              next[i] = saved;
              return next;
            });
          }
        }
      }
    } else {
      const optimisticRow = {
        id: `optimistic-${libraryKey}-${Date.now()}`,
        user_id: user.id,
        status,
        comic_id,
        gcd_issue_id: null,
      };
      setCollections((prev) => [
        ...prev.filter((row) => makeLibraryKey(row) !== libraryKey),
        optimisticRow,
      ]);
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
    await refreshLibrary({ background: true });
    return { ok: false, error: error.message || "Failed to update library" };
  }

  // Named collection_add (not "first_"), fired on every add — GA4 can
  // derive first-occurrence in reporting from the raw event stream. A
  // literal "first" name here would be misleading since this fires on
  // every add, not just the first ever.
  trackEvent("collection_add", { status });

  // The funnel's activation events. collection_add above fires on every
  // add; these fire once per account per status (strictly: whenever that
  // status goes from zero books to one, so someone who empties their
  // wantlist and starts again fires it again, which is rare enough to live
  // with). They carry first-touch attribution so an Instagram signup who
  // adds a comic three days later is still counted as Instagram.
  if (isFirstOfStatus) {
    trackEvent(status === "wishlist" ? "first_wantlist_add" : "first_collection_add", {
      ...attributionParams(),
    });
  }
    return { ok: true };
    });
  }

  async function removeFromCollection(inputId, { rowId, scope = "latest-copy" } = {}) {
    if (!user?.id) return { ok: false, error: "Sign in required" };

    const { comic_id, gcd_issue_id, libraryKey } = parseLibraryInput(inputId);
    if (!libraryKey) return { ok: false, error: "Invalid library item" };

    return withKeyLock(libraryKey, async () => {
    const keyRows = collections.filter((row) => makeLibraryKey(row) === libraryKey);
    let plan;
    try {
      plan = rowId
        ? planRemove(keyRows, { scope: "copy", rowId })
        : gcd_issue_id != null
        ? planRemove(keyRows, { scope })
        : { inserts: [], updates: [], deletes: keyRows.slice(0, 1).map((row) => row.id) };
    } catch (error) {
      return { ok: false, error: error.message };
    }

    if (!plan.deletes.length) return { ok: true };
    // A row added a moment ago may still carry its temporary id until the
    // save returns. Deleting that id would fail at the database (not a uuid).
    // Local comics delete by comic_id below, so they're unaffected.
    const deletesById = rowId || gcd_issue_id != null;
    if (deletesById && plan.deletes.some((id) => String(id).startsWith("optimistic-"))) {
      return { ok: false, error: "Still saving that book. Try again in a moment." };
    }
    const deleteIds = new Set(plan.deletes);
    setCollections((prev) => prev.filter((row) => !deleteIds.has(row.id)));

    const supabase = getSupabaseClient();
    let query = supabase
      .from("user_collections")
      .delete()
      .eq("user_id", user.id);

    if (rowId) {
      query = query.eq("id", rowId);
    } else if (gcd_issue_id != null) {
      query = plan.deletes.length === 1
        ? query.eq("id", plan.deletes[0])
        : query.in("id", plan.deletes);
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
      await refreshLibrary({ background: true });
      return { ok: false, error: error.message || "Failed to remove item" };
    }
    return { ok: true };
    });
  }

  // Add an additional copy of an issue already (or not yet) in the collection.
  // Unlike addToCollection which dedupes by (user, gcd_issue_id), this always
  // inserts a NEW row. Auto-increments copy_number based on existing copies
  // sharing the same (user, gcd_issue_id, variant_label). Variant label
  // defaults to null (= same printing as base entry).
  async function addAnotherCopy(inputId, { variant_label = null } = {}) {
    if (!user?.id) return { ok: false, error: "Sign in required" };
    const { comic_id, gcd_issue_id, libraryKey } = parseLibraryInput(inputId);
    if (!libraryKey) return { ok: false, error: "Invalid library item" };
    return withKeyLock(libraryKey, async () => {
    const supabase = getSupabaseClient();

    // Find existing copies to determine next copy_number.
    let query = supabase
      .from("user_collections")
      .select("copy_number, variant_label")
      .eq("user_id", user.id);
    if (gcd_issue_id != null) query = query.eq("gcd_issue_id", gcd_issue_id);
    else if (comic_id != null) query = query.eq("comic_id", comic_id);
    if (variant_label) query = query.eq("variant_label", variant_label);
    else query = query.is("variant_label", null);

    const { data: existing, error: readError } = await query;
    if (readError) {
      console.error("addAnotherCopy read failed", readError);
      return { ok: false, error: readError.message || "Failed to read copies" };
    }
    const nextCopy = nextCopyNumber(existing ?? [], variant_label);

    const optimisticId = `optimistic-${libraryKey}-${Date.now()}`;
    setCollections((prev) => [...prev, {
      id: optimisticId,
      user_id: user.id,
      status: "owned",
      comic_id: comic_id ?? null,
      gcd_issue_id: gcd_issue_id ?? null,
      variant_label,
      copy_number: nextCopy,
      created_at: new Date().toISOString(),
    }]);

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
      await refreshLibrary({ background: true });
      return { ok: false, error: error.message || "Failed to add copy" };
    }
    refreshLibrary({ background: true });
    return { ok: true };
    });
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
