"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import FoundingQueryMessage from "@/components/FoundingQueryMessage";
import ShareCardButton from "@/components/ShareCardButton";
import { fillMosaic } from "@/lib/foundingShowcasePick";

// initialRemaining comes from the server-rendered page (see page.js) - this
// used to default to a hardcoded 83 in useState, which flashed to the real
// count as soon as the client fetch below resolved. Same bug and fix as
// FoundingBanner.js. null means "don't know yet"; render a dash rather than
// a guessed digit.
//
// 2026-10-01 redesign: a numbered foil pass, a wall of the claimed passes,
// and a Roll of Honor of the founders so far. 2026-10-28: the wall shows
// only claimed passes plus one "Your spot" tile, no empty slots, so it
// reads as who's here rather than how many are missing.
// 2026-11-20: the pass became gold foil on a mosaic of covers (the
// founder's own once they have one), with a "Save to share" post image.

const CAP = 100;
const PASS_CELLS = 9; // covers in the mosaic behind the number
const pad = (n) => String(n).padStart(3, "0");

// Your pass number, remembered per user so a returning founder sees it on
// first paint instead of "★" and then the number.
const NUMBER_KEY = (userId) => `cc:founding-number:${userId}`;
function readNumber(userId) {
  try {
    const n = Number(window.localStorage.getItem(NUMBER_KEY(userId)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function writeNumber(userId, n) {
  try {
    if (userId && n) window.localStorage.setItem(NUMBER_KEY(userId), String(n));
  } catch {
    // Storage blocked; the number still arrives from the status call.
  }
}

// The confirm link lands here, usually in a different browser from the one
// that signed up: an email app opens its own, and Instagram's in-app browser
// never shares a session with anything. So "you're in" has to read right for a
// signed-out visitor too. Everything this feeds is gated on claimStateKnown,
// which is false on the server and through hydration.
function readJustClaimed() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("claimed") === "1";
}

export default function FoundingCollectorsClient({ initialRemaining = null, roster = [] }) {
  const { user, profile, loading } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState({ remaining: initialRemaining, isFounding: false, canClaim: false });
  // Whose status `status` describes: "anon", a user id, or null before the
  // first fetch. Claim state renders only once it matches the current viewer,
  // so the page never shows "Claim your pass" or "Go to your library" to a
  // founder while it's still finding out who they are.
  const [statusFor, setStatusFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [justClaimed] = useState(readJustClaimed);

  async function fetchStatus() {
    const response = userId
      ? await authedFetch("/api/founding/status", { cache: "no-store" })
      : await fetch("/api/founding/status", { cache: "no-store" });
    return response.ok ? response.json() : null;
  }

  // One status call per viewer, after auth has resolved. It used to fire
  // once anonymously and again when the user arrived, and again on every
  // token refresh because it keyed on the user object.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    fetchStatus().then((data) => {
      if (cancelled || !data) return;
      setStatus(data);
      setStatusFor(userId ?? "anon");
      if (userId && data.number) writeNumber(userId, data.number);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  async function claim() {
    setBusy(true); setMessage("");
    const response = await authedFetch("/api/founding/status", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data.error || "Could not activate your membership");
    setMessage(data.pending
      ? "Sent. Check your email, and your spam folder too."
      : "Your Founding Collector pass is active.");
    const next = await fetchStatus();
    if (next) {
      setStatus(next);
      setStatusFor(userId ?? "anon");
      if (userId && next.number) writeNumber(userId, next.number);
    }
  }

  const statusReady = statusFor === (userId ?? "anon");
  // The profile flag is known as soon as auth is (cached on the client), so
  // a founder sees their state immediately; the status call fills in the rest.
  const isFounder = (statusReady && status.isFounding) || Boolean(profile?.is_founding_collector);
  // userId is null on the server and during hydration (auth starts out
  // loading), so the localStorage read only ever runs in the browser.
  const passNumber = (statusReady && status.number) || (userId ? readNumber(userId) : null);
  // Signed out needs no status call: the server already rendered the count.
  const claimStateKnown = !loading && (!userId || isFounder || statusReady);

  // A confirm link is out. The next step is in their inbox, not on this page.
  const pendingClaim = statusReady && !isFounder && Boolean(status.pending);
  const justClaimedSignedOut = !loading && justClaimed && !userId;

  const remaining = status.remaining;
  const claimed = remaining == null ? null : Math.max(0, CAP - remaining);
  const nextNumber = claimed == null ? null : Math.min(CAP, claimed + 1);
  const soldOut = remaining === 0;
  const byNumber = new Map(roster.map((f) => [f.number, f]));
  // A founder whose own tile shows only their avatar gets a nudge to add a book.
  const ownTile = isFounder && passNumber ? byNumber.get(passNumber) : null;
  const ownTileBare = Boolean(ownTile?.username && !ownTile.cover);

  // The pass face: a founder's own books behind their number, everyone else
  // the books on the wall. Held empty (plain navy) until we know whose pass
  // it is, so a founder never sees the wall's covers swap for their own.
  const wallCovers = roster.map((f) => f.cover).filter(Boolean);
  const mosaicReady = claimStateKnown && (!isFounder || statusReady);
  const mosaic = mosaicReady
    ? fillMosaic(isFounder ? status.passCovers : [], wallCovers, PASS_CELLS)
    : [];

  // Foil sheen and tilt follow the pointer. Written straight to CSS custom
  // properties so moving the mouse never re-renders the page; CSS turns
  // them off for touch screens and reduced motion.
  const passRef = useRef(null);
  function tiltPass(event) {
    const el = passRef.current;
    if (!el || event.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    el.style.setProperty("--px", ((event.clientX - box.left) / box.width).toFixed(3));
    el.style.setProperty("--py", ((event.clientY - box.top) / box.height).toFixed(3));
    el.classList.add("is-tilting");
  }
  function restPass() {
    const el = passRef.current;
    if (!el) return;
    el.style.removeProperty("--px");
    el.style.removeProperty("--py");
    el.classList.remove("is-tilting");
  }

  return (
    <main className="founding-page fc">
      <section className="fc-hero">
        <div className="fc-hero-copy">
          <p className="fc-kicker">Founding Collectors · The first {CAP}</p>
          <h1 className="fc-title">
            {soldOut ? "All hundred" : "Be one of"}{" "}
            <span>{soldOut ? "are claimed." : "the first hundred."}</span>
          </h1>
          <p className="fc-lede">
            The first hundred collectors get a lifetime membership, free, with no card: no upgrade prompts, and a numbered Founding Collector badge nobody after No. 100 can get. After that, membership is $4 a month. Your name goes on the wall below, for good.
          </p>

          {!claimStateKnown ? (
            // Same height as the CTA row, nothing visible, while we find out
            // who's looking.
            <div className="fc-ctas" aria-hidden="true" style={{ visibility: "hidden" }}>
              <span className="lp-cta-primary">Claim your pass, free</span>
            </div>
          ) : isFounder ? (
            <div className="fc-done">You&rsquo;re Founding Collector No. {passNumber ? pad(passNumber) : "★"}. Your lifetime membership is active, and your name is on the wall.</div>
          ) : soldOut ? (
            <div className="fc-done">All {CAP} passes are claimed. Thank you to every one of them.</div>
          ) : justClaimedSignedOut ? (
            <div className="fc-done">
              You&rsquo;re in. Your Founding Collector pass is claimed.{" "}
              <Link href="/login?next=/founding-collectors" className="fc-done-link">Log in</Link> to see your number.
            </div>
          ) : !user ? (
            <div className="fc-ctas">
              <Link href="/signup" className="lp-cta-primary">Claim your pass, free</Link>
              <Link href="/login?next=/founding-collectors" className="fc-ghost">I have an account →</Link>
            </div>
          ) : pendingClaim ? (
            <div className="fc-pending">
              <p className="fc-pending-title">One more step: check your email.</p>
              <p>
                We sent a confirmation link to <b>{status.pendingEmail}</b>. Click it and your Founding Collector pass is yours. It&rsquo;s first come, first served, so confirm soon.
              </p>
              <div className="fc-pending-actions">
                <button type="button" className="fc-pending-resend" onClick={claim} disabled={busy}>
                  {busy ? "Sending…" : "Send it again"}
                </button>
                <span>Not there? Check your spam folder.</span>
              </div>
            </div>
          ) : status.canClaim ? (
            <div className="fc-ctas">
              <button className="lp-cta-primary fc-claim" onClick={claim} disabled={busy}>
                {busy ? "Activating…" : `Claim pass No. ${pad(nextNumber ?? 0)}`}
              </button>
            </div>
          ) : (
            <div className="fc-ctas">
              <Link href="/library" className="lp-cta-primary">Go to your library</Link>
            </div>
          )}
          {message && <p className="founding-message">{message}</p>}
          {!message && (
            <Suspense fallback={null}>
              <FoundingQueryMessage
                signedIn={Boolean(userId)}
                isFounder={isFounder}
                pending={pendingClaim}
                justClaimedSignedOut={justClaimedSignedOut}
              />
            </Suspense>
          )}
        </div>

        <div className="fc-pass-wrap">
          <div className="fc-pass" ref={passRef} onPointerMove={tiltPass} onPointerLeave={restPass} aria-hidden="true">
            <div className="fc-pass-face">
              <div className="fc-pass-mosaic">
                {mosaic.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" decoding="async" />
                ))}
              </div>
              <div className="fc-pass-scrim" />
              <div className="fc-pass-body">
                <div className="fc-pass-top">
                  <span className="fc-pass-brand">
                    <Image src="/img/logos/cc_badge.png" alt="" width={26} height={26} />
                    ComixCatalog
                  </span>
                  <span className="fc-pass-est">Est. 2026</span>
                </div>
                <div className="fc-pass-no">
                  <span className="fc-pass-no-label">No.</span>
                  <span className="fc-pass-no-num">{!claimStateKnown ? "---" : isFounder ? (passNumber ? pad(passNumber) : "★") : justClaimedSignedOut ? "★" : nextNumber == null ? "---" : pad(nextNumber)}</span>
                  <span className="fc-pass-no-cap">/{CAP}</span>
                </div>
                <div className="fc-pass-title">Founding<br />Collector</div>
                <div className="fc-pass-foot">
                  <span className={isFounder && profile?.username ? "" : "fc-pass-foot-muted"}>
                    {isFounder && profile?.username ? `@${profile.username}` : "Your name here"}
                  </span>
                  <span className="fc-pass-foot-muted">Member for life</span>
                </div>
              </div>
              <div className="fc-pass-holo" />
              <div className="fc-pass-glare" />
            </div>
          </div>
          {isFounder && statusReady && profile?.username && (
            <ShareCardButton
              ownerId={userId}
              username={profile.username}
              type="founding"
              requireBooks={false}
              className="fc-pass-share"
              label="Save to share"
              title="Your Founding Collector pass"
              alt={`Founding Collector pass No. ${passNumber ? pad(passNumber) : ""} for @${profile.username}`}
              invitePath="/founding-collectors"
              inviteCampaign="founding_pass"
              hint="Post it to your feed or your Story. On a Story, add a Link sticker with your invite link so whoever taps it can claim one of the passes that are left. If saving doesn't work in this browser, press and hold the image."
            />
          )}
        </div>
      </section>

      <section className="fc-wall" aria-label="The founding collectors so far">
        <div className="fc-wall-head">
          <p className="fc-kicker">Roll of Honor · The first {CAP}</p>
          <h2>The ones who were here first.</h2>
          <p className="fc-wall-sub">Each tile shows a book from that collector&rsquo;s collection.</p>
          {ownTileBare && (
            <p className="fc-wall-hint">
              Your tile has no book yet. <Link href="/search">Add one to your collection</Link> and its cover goes up here.
            </p>
          )}
        </div>
        <ol className="fc-tiles">
          {Array.from({ length: CAP }, (_, i) => {
            const founder = byNumber.get(i + 1);
            const isClaimed = Boolean(founder) || (claimed != null && i < claimed);
            if (!isClaimed) return null;
            const no = <span className="fc-tile-no"><small>No.</small>{pad(i + 1)}</span>;
            // Private founders keep their number and stay anonymous.
            if (!founder?.username) {
              return (
                <li key={i} className="fc-tile is-private">
                  <span className="fc-tile-art">
                    <Image src="/img/logos/cc_badge.png" alt="" width={48} height={48} className="fc-tile-badge" />
                  </span>
                  {no}
                  <span className="fc-tile-name">Private collector</span>
                </li>
              );
            }
            const hasBook = Boolean(founder.cover);
            return (
              <li key={i} className={`fc-tile ${hasBook ? "has-book" : "no-book"}`}>
                <Link
                  prefetch={false}
                  href={`/u/${encodeURIComponent(founder.username)}`}
                  title={hasBook && founder.bookTitle ? `@${founder.username} · ${founder.bookTitle}` : `@${founder.username}`}
                  aria-label={`No. ${pad(founder.number)}, @${founder.username}`}
                >
                  <span className="fc-tile-art">
                    {hasBook ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={founder.cover} alt="" loading="lazy" className="fc-tile-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={founder.avatar} alt="" loading="lazy" className="fc-tile-face" />
                    )}
                  </span>
                  {no}
                  <span className="fc-tile-name">
                    {hasBook && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={founder.avatar} alt="" loading="lazy" width={22} height={22} />
                    )}
                    <span>@{founder.username}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {/* The next open pass, for anyone who can still take one. Waits for
              claim state so a founder never sees it flash. */}
          {claimStateKnown && !isFounder && !justClaimedSignedOut && !soldOut && nextNumber != null && (() => {
            const label = (
              <>
                <span className="fc-tile-no"><small>No.</small>{pad(nextNumber)}</span>
                <b>Your spot</b>
                <em>Claim it free</em>
              </>
            );
            if (!user) {
              return <li className="fc-tile is-open"><Link href="/signup" aria-label={`Claim pass No. ${pad(nextNumber)}`}>{label}</Link></li>;
            }
            if (status.canClaim && !pendingClaim) {
              return (
                <li className="fc-tile is-open">
                  <button type="button" onClick={claim} disabled={busy} aria-label={`Claim pass No. ${pad(nextNumber)}`}>{label}</button>
                </li>
              );
            }
            return <li className="fc-tile is-open"><span>{label}</span></li>;
          })()}
        </ol>
      </section>

      <section className="fc-perks">
        <h2>What you keep, for life</h2>
        <div className="fc-perk-grid">
          <div className="fc-perk"><b>Lifetime membership</b><span>After the first 100, Collector+ costs $4 a month. The collector toolkit stays free for everyone. Your membership is free, for life.</span></div>
          <div className="fc-perk"><b>No upgrade prompts</b><span>House promos will not ask you to upgrade.</span></div>
          <div className="fc-perk"><b>The badge</b><span>A permanent Founding Collector badge on your profile.</span></div>
        </div>
      </section>

      <section className="fc-note">
        <p>
          Every one of these people signed up before this place had much to
          show for itself. They&rsquo;re the ones telling me what&rsquo;s broken
          and what to build next. That deserves more than a discount.
        </p>
        <p className="fc-sign">Tony, founder</p>
      </section>

      <p className="founding-terms fc-terms">
        Lifetime means the lifetime of your ComixCatalog account and the ComixCatalog service. The pass is non-transferable and includes the standard Collector Pro membership benefits; marketplace fees, third-party data costs, physical services, and unrelated future products are not included.
      </p>
    </main>
  );
}
