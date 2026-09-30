"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";

// "Share My Collection" → a 1080×1920 Story image of the signed-in user's own
// collection (see src/app/api/share-card). The user-driven half of the
// Instagram funnel: their card goes on their Story, their invite link goes
// in the Link sticker, and whoever taps it lands on /start with the sharer
// recorded as ?ref=.
//
// No Instagram API. On phones the Web Share API hands the image to the OS
// share sheet, where "Instagram → Stories" is one of the targets. Where
// that is not available (desktop, some in-app browsers) the image can be
// saved or long-pressed instead.
//
// Self-gating, like EditProfileButton: it renders only for the signed-in
// owner of `ownerId`, and only once they own at least one book. The check
// has to be client-side because sessions live in localStorage, so a server
// component's own isOwner never sees a user. The API enforces ownership
// regardless; this gate only decides whether the button shows.
export default function ShareCardButton({ ownerId, username, type = "collection", className = "" }) {
  const { user } = useAuth();
  const { collections } = useLibrary();
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId);
  const hasOwned = collections.some((c) => c.status === "owned");
  const dialogRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  // Object URLs hold the PNG in memory until revoked.
  useEffect(() => () => imageUrl && URL.revokeObjectURL(imageUrl), [imageUrl]);

  const inviteLink =
    typeof window !== "undefined" && username
      ? `${window.location.origin}/start?utm_source=instagram&utm_medium=story&utm_campaign=share_card&ref=${encodeURIComponent(username)}`
      : null;

  async function open() {
    dialogRef.current?.showModal();
    if (state === "ready") return;
    setState("loading");
    setError(null);
    try {
      const res = await authedFetch(`/api/share-card?type=${encodeURIComponent(type)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't make your card. Try again.");
      }
      const blob = await res.blob();
      setFile(new File([blob], `comixcatalog-${type}.png`, { type: "image/png" }));
      setImageUrl(URL.createObjectURL(blob));
      setState("ready");
      trackEvent("share_card_generated", { card_type: type });
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  const canShareFile =
    state === "ready" &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  async function share() {
    try {
      await navigator.share({ files: [file] });
      trackEvent("share_card_action", { card_type: type, method: "share_sheet" });
    } catch (err) {
      // AbortError = they closed the share sheet. Not an error worth showing.
      if (err?.name !== "AbortError") setError("Sharing didn't work here. Save the image instead.");
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent("share_card_action", { card_type: type, method: "copy_invite_link" });
    } catch {
      setError("Couldn't copy. Your link is: " + inviteLink);
    }
  }

  if (!isOwner || !hasOwned) return null;

  return (
    <>
      <button type="button" className={className} onClick={open}>
        Share my collection card
      </button>

      <dialog
        ref={dialogRef}
        className="share-card-dialog"
        aria-labelledby="share-card-title"
        onClick={(e) => {
          // Click on the backdrop (the dialog element itself) closes it.
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="share-card-inner">
          <div className="share-card-head">
            <h2 id="share-card-title" className="share-card-title">Your collection card</h2>
            <button
              type="button"
              className="share-card-close"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>

          <div className="share-card-preview" aria-live="polite">
            {state === "loading" && <p className="share-card-status">Making your card…</p>}
            {state === "error" && <p className="share-card-status share-card-error">{error}</p>}
            {state === "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Your ComixCatalog collection card" className="share-card-img" />
            )}
          </div>

          {state === "ready" && (
            <>
              <div className="share-card-actions">
                {canShareFile && (
                  <button type="button" className="share-card-btn share-card-btn-primary" onClick={share}>
                    Share to Instagram…
                  </button>
                )}
                <a
                  href={imageUrl}
                  download={file?.name}
                  className={`share-card-btn ${canShareFile ? "" : "share-card-btn-primary"}`}
                  onClick={() => trackEvent("share_card_action", { card_type: type, method: "download" })}
                >
                  Save image
                </a>
                {inviteLink && (
                  <button type="button" className="share-card-btn" onClick={copyInvite}>
                    {copied ? "✓ Link copied" : "Copy your invite link"}
                  </button>
                )}
              </div>
              <p className="share-card-hint">
                On Instagram: post the image to your Story, then add a Link sticker and paste your
                invite link. If saving doesn&rsquo;t work in this browser, press and hold the image.
              </p>
              {error && <p className="share-card-status share-card-error">{error}</p>}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
