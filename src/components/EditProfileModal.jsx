"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { getSupabaseClient } from "@/lib/supabase/client";

const BIO_MAX = 500;
const DISPLAY_NAME_MAX = 60;
const LOCATION_MAX = 80;
const URL_MAX = 200;

const GOLD = "#f4d03f";

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(8,10,16,0.72)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "56px 20px 24px",
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 600,
    background: "#15171f",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 80px)",
    color: "#fff",
    fontFamily: "inherit",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 22px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  headerTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  closeBtn: {
    background: "transparent",
    border: 0,
    color: "rgba(255,255,255,0.6)",
    fontSize: "1.7rem",
    lineHeight: 1,
    cursor: "pointer",
    padding: "4px 10px",
    borderRadius: 6,
  },
  body: {
    padding: "0 22px",
    overflowY: "auto",
    flex: "1 1 auto",
  },
  section: {
    padding: "18px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  sectionLast: {
    padding: "18px 0",
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    marginBottom: 12,
  },
  label: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "rgba(255,255,255,0.75)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  counter: {
    fontSize: "0.72rem",
    fontWeight: 500,
    color: "rgba(255,255,255,0.4)",
  },
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#fff",
    fontSize: "0.94rem",
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  },
  textarea: {
    width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#fff",
    fontSize: "0.94rem",
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
    resize: "vertical",
    minHeight: 96,
    lineHeight: 1.5,
  },
  avatarRow: {
    display: "flex",
    gap: 18,
    alignItems: "center",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  avatarSide: { flex: 1, minWidth: 0 },
  avatarLabel: { fontWeight: 600, fontSize: "0.95rem", marginBottom: 2 },
  avatarHint: {
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.45)",
    marginBottom: 10,
  },
  avatarActions: { display: "flex", gap: 8 },
  toggleGroup: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "6px 0 6px 14px",
    borderLeft: "2px solid rgba(255,255,255,0.06)",
  },
  toggle: {
    display: "grid",
    gridTemplateColumns: "18px 1fr",
    columnGap: 12,
    rowGap: 2,
    alignItems: "center",
    cursor: "pointer",
    padding: "6px 0",
  },
  toggleDisabled: { cursor: "not-allowed" },
  toggleCheckbox: {
    gridColumn: 1,
    gridRow: 1,
    width: 16,
    height: 16,
    margin: 0,
    accentColor: GOLD,
    cursor: "inherit",
  },
  toggleLabel: { gridColumn: 2, gridRow: 1, fontSize: "0.92rem", color: "#fff" },
  toggleLabelDisabled: { color: "rgba(255,255,255,0.35)" },
  toggleHint: {
    gridColumn: 2,
    gridRow: 2,
    fontSize: "0.78rem",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 1.4,
  },
  btn: {
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontFamily: "inherit",
  },
  btnGhost: {
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "#fff",
    fontFamily: "inherit",
  },
  btnPrimary: {
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: "0.88rem",
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${GOLD}`,
    background: GOLD,
    color: "#181a22",
    fontFamily: "inherit",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  errorBox: {
    marginTop: 14,
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.4)",
    color: "#fca5a5",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: "0.86rem",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "14px 22px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
};

function isValidUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function EditProfileModal({ profile, onClose, onSaved }) {
  const supabase = getSupabaseClient();
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [location, setLocation] = useState(profile.location || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [websiteUrl, setWebsiteUrl] = useState(profile.website_url || "");

  const [showCollection, setShowCollection] = useState(
    profile.show_collection !== false
  );
  const [showWantlist, setShowWantlist] = useState(
    profile.show_wantlist !== false
  );
  const [showForSale, setShowForSale] = useState(
    profile.show_for_sale !== false
  );
  const [showValue, setShowValue] = useState(profile.show_value !== false);
  const [isPublic, setIsPublic] = useState(profile.is_public !== false);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onEsc(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function handleAvatarFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar too large (max 5MB).");
      return;
    }

    setAvatarUploading(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${profile.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub?.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null;
      if (!url) throw new Error("Could not resolve public URL");

      // Persist the new avatar_url immediately so it survives a Cancel.
      // Saving was previously deferred to handleSave; if the user closed the
      // modal without hitting Save, the upload was effectively lost.
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", profile.id);
      if (dbErr) throw dbErr;

      setAvatarUrl(url);
    } catch (err) {
      console.error("avatar upload failed:", err);
      // Surface the actual error message so RLS / bucket-missing /
      // network failures are debuggable instead of opaque.
      const msg = err?.message || String(err);
      setError(`Avatar upload failed: ${msg}`);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    if (websiteUrl && !isValidUrl(websiteUrl)) {
      setError("Website must start with http:// or https://");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        display_name: displayName.trim() || null,
        location: location.trim() || null,
        bio: bio.trim().slice(0, BIO_MAX) || null,
        website_url: websiteUrl.trim() || null,
        avatar_url: avatarUrl || null,
        is_public: isPublic,
        show_collection: showCollection,
        show_wantlist: showWantlist,
        show_for_sale: showForSale,
        show_value: showValue,
      };

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (updateErr) throw updateErr;

      onSaved?.(payload);
      onClose?.();
    } catch (err) {
      console.error("profile save failed:", err);
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  const fallbackAvatar = `/avatars/${profile.avatar_key || "cc_badge"}.png`;

  const modal = (
    <div style={S.overlay} onClick={onClose} role="presentation">
      <div
        style={S.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
      >
        <header style={S.header}>
          <h2 style={S.headerTitle}>Edit profile</h2>
          <button
            type="button"
            style={S.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div style={S.body}>
          {/* Avatar */}
          <section style={S.section}>
            <div style={S.avatarRow}>
              <div style={S.avatar}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={S.avatarImg} />
                ) : (
                  <Image
                    src={fallbackAvatar}
                    alt=""
                    width={96}
                    height={96}
                    style={S.avatarImg}
                  />
                )}
              </div>
              <div style={S.avatarSide}>
                <div style={S.avatarLabel}>Profile photo</div>
                <div style={S.avatarHint}>JPG or PNG, square. Max 5MB.</div>
                <div style={S.avatarActions}>
                  <button
                    type="button"
                    style={{
                      ...S.btn,
                      ...(avatarUploading ? S.btnDisabled : null),
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading
                      ? "Uploading…"
                      : avatarUrl
                      ? "Replace"
                      : "Upload"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      style={{
                        ...S.btnGhost,
                        ...(avatarUploading ? S.btnDisabled : null),
                      }}
                      onClick={async () => {
                        setAvatarUploading(true);
                        setError(null);
                        try {
                          const { error: dbErr } = await supabase
                            .from("profiles")
                            .update({ avatar_url: null })
                            .eq("id", profile.id);
                          if (dbErr) throw dbErr;
                          setAvatarUrl(null);
                        } catch (err) {
                          const msg = err?.message || String(err);
                          setError(`Remove failed: ${msg}`);
                        } finally {
                          setAvatarUploading(false);
                        }
                      }}
                      disabled={avatarUploading}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </section>

          {/* Identity */}
          <section style={S.section}>
            <h3 style={S.sectionTitle}>About you</h3>

            <div style={S.grid2}>
              <div style={{ ...S.field, marginBottom: 0 }}>
                <label style={S.label} htmlFor="pe-name">
                  Display name
                </label>
                <input
                  id="pe-name"
                  style={S.input}
                  type="text"
                  value={displayName}
                  maxLength={DISPLAY_NAME_MAX}
                  placeholder="Optional"
                  onChange={(e) => setDisplayName(e.target.value)}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "rgba(244,208,63,0.55)")
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = "rgba(255,255,255,0.1)")
                  }
                />
              </div>
              <div style={{ ...S.field, marginBottom: 0 }}>
                <label style={S.label} htmlFor="pe-loc">
                  Location
                </label>
                <input
                  id="pe-loc"
                  style={S.input}
                  type="text"
                  value={location}
                  maxLength={LOCATION_MAX}
                  placeholder="e.g. Chicago, IL"
                  onChange={(e) => setLocation(e.target.value)}
                  onFocus={(e) =>
                    (e.target.style.borderColor = "rgba(244,208,63,0.55)")
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = "rgba(255,255,255,0.1)")
                  }
                />
              </div>
            </div>

            <div style={S.field}>
              <label style={S.label} htmlFor="pe-web">
                Website
              </label>
              <input
                id="pe-web"
                style={S.input}
                type="url"
                value={websiteUrl}
                maxLength={URL_MAX}
                placeholder="https://…"
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onFocus={(e) =>
                  (e.target.style.borderColor = "rgba(244,208,63,0.55)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "rgba(255,255,255,0.1)")
                }
              />
            </div>

            <div style={{ ...S.field, marginBottom: 0 }}>
              <label style={S.label} htmlFor="pe-bio">
                <span>Bio</span>
                <span style={S.counter}>
                  {bio.length} / {BIO_MAX}
                </span>
              </label>
              <textarea
                id="pe-bio"
                style={S.textarea}
                rows={4}
                value={bio}
                maxLength={BIO_MAX}
                placeholder="What do you collect? What are you hunting?"
                onChange={(e) => setBio(e.target.value)}
                onFocus={(e) =>
                  (e.target.style.borderColor = "rgba(244,208,63,0.55)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "rgba(255,255,255,0.1)")
                }
              />
            </div>
          </section>

          {/* Privacy */}
          <section style={S.sectionLast}>
            <h3 style={S.sectionTitle}>Privacy</h3>

            <ToggleRow
              label="Public profile"
              hint="When off, your profile is hidden from everyone but you."
              checked={isPublic}
              onChange={setIsPublic}
            />
            <div style={S.toggleGroup}>
              <ToggleRow
                label="Show collection"
                checked={showCollection}
                disabled={!isPublic}
                onChange={setShowCollection}
              />
              <ToggleRow
                label="Show wantlist"
                checked={showWantlist}
                disabled={!isPublic}
                onChange={setShowWantlist}
              />
              <ToggleRow
                label="Show items for sale"
                checked={showForSale}
                disabled={!isPublic}
                onChange={setShowForSale}
              />
              <ToggleRow
                label="Show collection value"
                checked={showValue}
                disabled={!isPublic}
                onChange={setShowValue}
              />
            </div>
          </section>

          {error && <div style={S.errorBox}>{error}</div>}
        </div>

        <footer style={S.footer}>
          <button
            type="button"
            style={{ ...S.btnGhost, ...(saving ? S.btnDisabled : null) }}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            style={{
              ...S.btnPrimary,
              ...(saving || avatarUploading ? S.btnDisabled : null),
            }}
            onClick={handleSave}
            disabled={saving || avatarUploading}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function ToggleRow({ label, hint, checked, disabled, onChange }) {
  return (
    <label
      style={{
        ...S.toggle,
        ...(disabled ? S.toggleDisabled : null),
      }}
    >
      <input
        type="checkbox"
        style={S.toggleCheckbox}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        style={{
          ...S.toggleLabel,
          ...(disabled ? S.toggleLabelDisabled : null),
        }}
      >
        {label}
      </span>
      {hint && <span style={S.toggleHint}>{hint}</span>}
    </label>
  );
}
