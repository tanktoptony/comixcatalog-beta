"use client";

// Under the cover on the issue page, for a book you own: say which of the
// covers is yours, and confirm the version your own label already names.
// It lives here, not only in the editor far down the page, because this is
// where a collector notices the wrong cover.

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import { isPickedCatalogCover, versionChoices } from "@/lib/copyVersion";
import { dismissLabelSuggestion, isLabelSuggestionDismissed, suggestVersion } from "@/lib/labelEdition";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function OwnCopyCover({ issue, row, ownCover, choice, onCoverSaved, onVersionSaved }) {
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(true);

  // Read after mount: the server has no localStorage.
  useEffect(() => {
    queueMicrotask(() => setDismissed(isLabelSuggestionDismissed(row.id)));
  }, [row.id]);

  const suggestion = useMemo(
    () => (dismissed ? null : suggestVersion(row.variant_label, versionChoices(issue), {
      seriesTitle: issue.series_title,
      currentGcdId: row.gcd_issue_id,
    })),
    [dismissed, issue, row.variant_label, row.gcd_issue_id]
  );

  const ownPhoto = Boolean(ownCover) && !isPickedCatalogCover(ownCover);
  // The regular cover is what shows when nothing is picked, so it is only a
  // choice once something else is.
  const canSave = Boolean(choice) && choice.url !== ownCover && choice.key !== "own" && (choice.key !== "main" || Boolean(ownCover));

  async function saveCover() {
    setBusy("cover");
    setError(null);
    setDone(null);
    try {
      // Asks for the row back: an update that matches nothing is not an error.
      const { data, error: saveError } = await getSupabaseClient()
        .from("user_collections")
        .update({ user_cover_url: choice.url })
        .eq("id", row.id)
        .select("id");
      if (saveError) throw saveError;
      if (!data?.length) throw new Error("That copy was not updated.");
      trackEvent("issue_cover_pick", { matched: Boolean(choice.versionGcdId) });
      setDone("Saved. That is now the cover for your copy.");
      await onCoverSaved(choice.url);
    } catch (err) {
      console.error("cover pick failed:", err);
      setError("Could not save that cover. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmVersion() {
    setBusy("version");
    setError(null);
    try {
      const response = await authedFetch("/api/collection/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, gcd_issue_id: suggestion.gcdId, keep_cover: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change this copy.");
      trackEvent("library_label_suggestion", { answer: "yes", from: "issue" });
      await onVersionSaved(suggestion.gcdId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function dismiss() {
    dismissLabelSuggestion(row.id);
    setDismissed(true);
    trackEvent("library_label_suggestion", { answer: "no", from: "issue" });
  }

  if (!suggestion && !canSave && !done && !error) return null;

  return (
    <div className="issue-own-cover" aria-live="polite">
      {canSave && (ownPhoto ? (
        <p>Your own photo is showing for this copy. Remove it under Condition &amp; Grade to use a catalog cover.</p>
      ) : (
        <button type="button" className="grade-save-btn issue-own-cover-save" onClick={saveCover} disabled={Boolean(busy)}>
          {busy === "cover" ? "Saving..." : "Use this cover for my copy"}
        </button>
      ))}
      {done && !canSave && <p className="copy-version-done">{done}</p>}
      {suggestion && (
        <div className="copy-version-verdict">
          <p>You labeled your copy &ldquo;{row.variant_label}&rdquo;. Is it the <strong>{suggestion.name}</strong>?</p>
          <div className="copy-version-actions">
            <button type="button" className="grade-save-btn" onClick={confirmVersion} disabled={Boolean(busy)}>
              {busy === "version" ? "Saving..." : "Yes, that's mine"}
            </button>
            <button type="button" className="grade-cover-btn" onClick={dismiss} disabled={Boolean(busy)}>Not mine</button>
          </div>
        </div>
      )}
      {error && <div className="grade-error">{error}</div>}
    </div>
  );
}
