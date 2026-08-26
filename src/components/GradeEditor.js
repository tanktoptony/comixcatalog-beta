"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { estimateCoverPrice } from "@/lib/coverPrice";
import { trackEvent } from "@/lib/analytics";

const USER_COVER_UPLOAD_ENABLED = true;

const RAW_CONDITIONS = [
  { value: "", label: "Not set" },
  { value: "Poor", label: "Poor (P)" },
  { value: "Fair", label: "Fair (FA)" },
  { value: "Good", label: "Good (G)" },
  { value: "Very Good", label: "Very Good (VG)" },
  { value: "Fine", label: "Fine (F)" },
  { value: "Very Fine", label: "Very Fine (VF)" },
  { value: "Near Mint", label: "Near Mint (NM)" },
  { value: "Mint", label: "Mint (M)" },
];

const SLAB_COMPANIES = [
  { value: "", label: "None (Raw)" },
  { value: "CGC", label: "CGC" },
  { value: "CBCS", label: "CBCS" },
  { value: "PGX", label: "PGX" },
  { value: "CGC SS", label: "CGC Signature Series" },
];

const CGC_GRADES = [
  0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5,
  5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
  9.2, 9.4, 9.6, 9.8, 10.0,
];

// Public cert-lookup pages, confirmed live (2026-08-25) — not deep-linkable
// by cert number for either service (no documented query-string param), so
// this opens the registry's own lookup tool rather than pretending we can
// prefill it. PGX has no confirmed public lookup tool as of this writing;
// omit rather than link somewhere that might not exist.
const CERT_LOOKUP_URLS = {
  CGC: "https://www.cgccomics.com/certlookup/",
  "CGC SS": "https://www.cgccomics.com/certlookup/",
  CBCS: "https://www.cbcscomics.com/",
};

function gradeColor(grade) {
  if (!grade) return "rgba(255,255,255,0.2)";
  if (grade >= 9.6) return "#FFD700";  // gold
  if (grade >= 9.0) return "#4CAF50";  // green
  if (grade >= 7.0) return "#2196F3";  // blue
  if (grade >= 4.0) return "#FF9800";  // orange
  return "#F44336";                     // red
}

function GradeBadge({ grade, company, condition }) {
  if (grade) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        background: gradeColor(grade),
        color: grade >= 9.6 ? "#000" : "#fff",
        fontWeight: 800,
        fontSize: "0.8rem",
        letterSpacing: "0.03em",
      }}>
        {company && <span style={{ opacity: 0.85 }}>{company}</span>}
        {grade.toFixed(1)}
      </span>
    );
  }

  if (condition) {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.8)",
        fontWeight: 600,
        fontSize: "0.8rem",
      }}>
        {condition}
      </span>
    );
  }

  return null;
}

export { GradeBadge };

export default function GradeEditor({ collectionId, initialData = {}, canonicalCover = null, releaseYear = null, isPro = false, onSave }) {
  // Pro gate: professional grading (slab company, numeric grade, cert number)
  // and per-book photo upload are Collector Pro features. Free collectors still
  // track raw condition, what they paid, market value, and notes — enough to
  // manage a collection, which is the free hook. Client-side gate for now;
  // server-side enforcement (RLS / Pro-checked write path) is a follow-up.
  const canGrade = isPro;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [slabCompany, setSlabCompany] = useState(initialData.slab_company || "");
  const [gradeNumeric, setGradeNumeric] = useState(initialData.grade_numeric ?? "");
  const [condition, setCondition] = useState(initialData.condition || "");
  const [certNumber, setCertNumber] = useState(initialData.slab_cert_number || "");
  const [notes, setNotes] = useState(initialData.notes || "");
  const [purchasePrice, setPurchasePrice] = useState(
    initialData.purchase_price != null ? String(initialData.purchase_price) : ""
  );
  const [marketValue, setMarketValue] = useState(
    initialData.market_value != null ? String(initialData.market_value) : ""
  );
  const [userCoverUrl, setUserCoverUrl] = useState(initialData.user_cover_url || null);
  // Tracks the initialData prop itself (not derived state) so we can detect
  // a genuine prop change during render and re-sync userCoverUrl — e.g. when
  // library hydration delivers a freshly-uploaded photo for the same
  // component instance. Adjusting state during render (React's documented
  // pattern for this) instead of in a useEffect avoids the extra
  // render-then-effect-then-render pass that tripped the
  // set-state-in-effect lint rule.
  const [syncedCoverUrl, setSyncedCoverUrl] = useState(initialData.user_cover_url || null);
  if (syncedCoverUrl !== (initialData.user_cover_url || null)) {
    setSyncedCoverUrl(initialData.user_cover_url || null);
    setUserCoverUrl(initialData.user_cover_url || null);
  }
  const [uploading, setUploading] = useState(false);
  // Variant + multi-copy fields. variantLabel is freeform (collector types
  // "Newsstand", "Cover B", etc.). copyNumber distinguishes duplicates of
  // the same (issue, variant) — defaults to 1.
  const [variantLabel, setVariantLabel] = useState(initialData.variant_label || "");
  const [copyNumber, setCopyNumber] = useState(
    initialData.copy_number != null ? String(initialData.copy_number) : "1"
  );

  const isSlabbed = !!slabCompany;

  async function handleCoverFile(file) {
    if (!file || !collectionId) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image too large (max 8MB).");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `library/${collectionId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("comic-covers")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("comic-covers").getPublicUrl(path);
      // Cache-bust so the new image shows immediately after re-upload.
      const url = pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;
      if (!url) throw new Error("Could not resolve public URL");

      const { error: dbErr } = await supabase
        .from("user_collections")
        .update({ user_cover_url: url })
        .eq("id", collectionId);
      if (dbErr) throw dbErr;

      setUserCoverUrl(url);
      onSave?.({ user_cover_url: url });
    } catch (err) {
      console.error("cover upload failed:", err);
      setError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveCover() {
    if (!collectionId) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: dbErr } = await supabase
        .from("user_collections")
        .update({ user_cover_url: null })
        .eq("id", collectionId);
      if (dbErr) throw dbErr;
      setUserCoverUrl(null);
      onSave?.({ user_cover_url: null });
    } catch (err) {
      console.error("cover remove failed:", err);
      setError("Could not remove photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!collectionId) return;
    setSaving(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      const parsedPrice = purchasePrice.trim() !== "" ? Number(purchasePrice) : null;
      const parsedMarket = marketValue.trim() !== "" ? Number(marketValue) : null;
      const parsedCopy = copyNumber.trim() !== "" ? Number(copyNumber) : 1;
      const payload = {
        condition: isSlabbed ? null : condition || null,
        grade_numeric: isSlabbed && gradeNumeric !== "" ? Number(gradeNumeric) : null,
        slab_company: slabCompany || null,
        slab_cert_number: isSlabbed && certNumber ? certNumber.trim() : null,
        notes: notes.trim() || null,
        purchase_price: parsedPrice != null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
        market_value: parsedMarket != null && !Number.isNaN(parsedMarket) ? parsedMarket : null,
        variant_label: variantLabel.trim() || null,
        copy_number: Number.isFinite(parsedCopy) && parsedCopy >= 1 ? Math.floor(parsedCopy) : 1,
      };

      const { error: supabaseError } = await supabase
        .from("user_collections")
        .update(payload)
        .eq("id", collectionId);

      if (supabaseError) throw supabaseError;

      if (payload.grade_numeric != null || payload.condition != null) {
        trackEvent("grade_set", { slabbed: isSlabbed });
      }

      onSave?.(payload);
      setOpen(false);
    } catch (err) {
      console.error("GradeEditor save failed:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Reset to initial values on cancel
    setSlabCompany(initialData.slab_company || "");
    setGradeNumeric(initialData.grade_numeric ?? "");
    setCondition(initialData.condition || "");
    setCertNumber(initialData.slab_cert_number || "");
    setNotes(initialData.notes || "");
    setPurchasePrice(initialData.purchase_price != null ? String(initialData.purchase_price) : "");
    setMarketValue(initialData.market_value != null ? String(initialData.market_value) : "");
    setVariantLabel(initialData.variant_label || "");
    setCopyNumber(initialData.copy_number != null ? String(initialData.copy_number) : "1");
    setError(null);
    setOpen(false);
  }

  const currentGrade = initialData.grade_numeric;
  const currentCondition = initialData.condition;
  const currentCompany = initialData.slab_company;
  const hasGradeData = currentGrade || currentCondition || initialData.notes;

  return (
    <div className="grade-editor-wrap">
      {/* Trigger row */}
      <div className="grade-editor-trigger" onClick={() => setOpen(!open)}>
        <div className="grade-editor-badge-row">
          <GradeBadge
            grade={currentGrade}
            company={currentCompany}
            condition={currentCondition}
          />
          {initialData.notes && !currentGrade && !currentCondition && (
            <span className="grade-editor-note-preview">
              {initialData.notes.slice(0, 40)}{initialData.notes.length > 40 ? "…" : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          className="grade-editor-btn"
          aria-label={open ? "Close grade editor" : "Edit grade"}
        >
          {open ? "Cancel" : hasGradeData ? "Edit Grade" : "+ Add Grade"}
        </button>
      </div>

      {/* Inline editor panel */}
      {open && (
        <div className="grade-editor-panel">

          {/* Your photo of the book — Pro feature. */}
          {USER_COVER_UPLOAD_ENABLED && canGrade && (
            <div className="grade-field grade-cover-field">
              <label className="grade-label">Your photo of this book</label>
              <div className="grade-cover-row">
                {userCoverUrl ? (
                  <img
                    src={userCoverUrl}
                    alt="Your photo"
                    className="grade-cover-thumb"
                  />
                ) : canonicalCover ? (
                  <img
                    src={canonicalCover}
                    alt="Issue cover"
                    className="grade-cover-thumb"
                    style={{ opacity: 0.5 }}
                  />
                ) : (
                  <div className="grade-cover-thumb grade-cover-thumb-empty" aria-hidden="true">
                    No photo
                  </div>
                )}
                <div className="grade-cover-actions">
                  <label className={`grade-cover-btn ${uploading ? "is-disabled" : ""}`}>
                    {uploading ? "Uploading…" : userCoverUrl ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleCoverFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {userCoverUrl && (
                    <button
                      type="button"
                      className="grade-cover-remove"
                      onClick={handleRemoveCover}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="grade-cover-hint">
                Adds your specific copy to insurance PDFs and the public profile. Max 8MB.
              </div>
            </div>
          )}

          {canGrade ? (
            <>
              {/* Slab company */}
              <div className="grade-field">
                <label className="grade-label">Grading Company</label>
                <select
                  className="grade-select"
                  value={slabCompany}
                  onChange={(e) => {
                    setSlabCompany(e.target.value);
                    if (!e.target.value) {
                      setGradeNumeric("");
                      setCertNumber("");
                    }
                  }}
                >
                  {SLAB_COMPANIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Slabbed: numeric grade + cert */}
              {isSlabbed ? (
                <>
                  <div className="grade-field">
                    <label className="grade-label">Grade</label>
                    <select
                      className="grade-select"
                      value={gradeNumeric}
                      onChange={(e) => setGradeNumeric(e.target.value)}
                    >
                      <option value="">Select grade</option>
                      {CGC_GRADES.map((g) => (
                        <option key={g} value={g}>{g.toFixed(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grade-field">
                    <label className="grade-label">Cert Number</label>
                    <input
                      className="grade-input"
                      type="text"
                      placeholder="e.g. 4389276001"
                      value={certNumber}
                      onChange={(e) => setCertNumber(e.target.value)}
                    />
                    {certNumber.trim() && CERT_LOOKUP_URLS[slabCompany] && (
                      <div className="grade-hint">
                        <a
                          href={CERT_LOOKUP_URLS[slabCompany]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="grade-hint-link"
                        >
                          Verify this cert on {slabCompany === "CGC SS" ? "CGC" : slabCompany}&rsquo;s registry →
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Grade preview badge */}
                  {gradeNumeric && (
                    <div style={{ marginBottom: 10 }}>
                      <GradeBadge grade={Number(gradeNumeric)} company={slabCompany} />
                    </div>
                  )}
                </>
              ) : (
                /* Raw: condition dropdown */
                <div className="grade-field">
                  <label className="grade-label">Condition</label>
                  <select
                    className="grade-select"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                  >
                    {RAW_CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Free tier: raw condition only (slab grading is Pro). */}
              <div className="grade-field">
                <label className="grade-label">Condition</label>
                <select
                  className="grade-select"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  {RAW_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* In-context Pro upsell where the grading controls would be. */}
              <div
                className="grade-pro-upsell"
                style={{
                  border: "1px solid rgba(255,215,0,0.35)",
                  background: "rgba(255,215,0,0.06)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>
                  Professional grading is a Pro feature
                </div>
                <p style={{ fontSize: "0.8rem", opacity: 0.8, margin: "0 0 8px" }}>
                  Track CGC/CBCS/PGX slab grades, cert numbers, and upload your own
                  photo of each book.
                </p>
                <Link
                  href="/upgrade"
                  className="grade-hint-link"
                  style={{ fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}
                >
                  See Collector Pro membership options →
                </Link>
              </div>
            </>
          )}

          {/* Variant + copy number — distinguishes "Cover B" from "Newsstand"
              and "Copy 1 of 2" from "Copy 2 of 2" when the collector owns
              multiple copies of the same physical issue. */}
          <div className="grade-field-row">
            <div className="grade-field" style={{ flex: 2 }}>
              <label className="grade-label">Variant / Edition</label>
              <input
                className="grade-input"
                type="text"
                placeholder="e.g. Newsstand, Cover B, 1:25 Incentive"
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="grade-field" style={{ flex: 1 }}>
              <label className="grade-label">Copy #</label>
              <input
                className="grade-input"
                type="number"
                min="1"
                step="1"
                value={copyNumber}
                onChange={(e) => setCopyNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Purchase price */}
          <div className="grade-field">
            <label className="grade-label">Paid ($)</label>
            <input
              className="grade-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 12.00"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
            {(() => {
              const estimate = estimateCoverPrice(releaseYear);
              if (estimate == null || purchasePrice) return null;
              return (
                <div className="grade-hint">
                  Original cover price ~${estimate.toFixed(2)} ({releaseYear}).{" "}
                  <button
                    type="button"
                    className="grade-hint-link"
                    onClick={() => setPurchasePrice(estimate.toFixed(2))}
                  >
                    Use this
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Market value (self-reported for now; automated in Phase 3) */}
          <div className="grade-field">
            <label className="grade-label">Market Value ($)</label>
            <input
              className="grade-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 85.00"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="grade-field">
            <label className="grade-label">Notes</label>
            <textarea
              className="grade-textarea"
              placeholder="Spine stress, colour touch, tanning… anything worth noting."
              value={notes}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="grade-error">{error}</div>
          )}

          <div className="grade-actions">
            <button
              type="button"
              className="grade-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="grade-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
