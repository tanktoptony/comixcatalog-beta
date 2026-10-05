"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

// initialRemaining comes from the server-rendered page (see page.js) — this
// used to default to a hardcoded 83 in useState, which flashed to the real
// count as soon as the client fetch below resolved. Same bug and fix as
// FoundingBanner.js. null means "don't know yet"; render a dash rather than
// a guessed digit.
//
// 2026-10-01 redesign: a numbered foil pass, a 100-slot grid that shows
// how many are claimed, and a Roll of Honor of the founders so far.

const CAP = 100;
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
    setMessage("Your Founding Collector pass is active. Welcome to Pro for life.");
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

  const remaining = status.remaining;
  const claimed = remaining == null ? null : Math.max(0, CAP - remaining);
  const nextNumber = claimed == null ? null : Math.min(CAP, claimed + 1);
  const soldOut = remaining === 0;
  const byNumber = new Map(roster.map((f) => [f.number, f]));
  const publicRoster = roster.filter((f) => f.username);

  return (
    <main className="founding-page fc">
      <section className="fc-hero">
        <div className="fc-hero-copy">
          <p className="fc-kicker">Founding Collectors · The first {CAP}</p>
          <h1 className="fc-title">
            {remaining == null ? "—" : remaining}{" "}
            <span>lifetime Pro passes left.</span>
          </h1>
          <p className="fc-lede">
            The first hundred collectors on ComixCatalog get Collector Pro for
            life, free, with no card. And their name goes on the wall below,
            for good.
          </p>

          {!claimStateKnown ? (
            // Same height as the CTA row, nothing visible, while we find out
            // who's looking.
            <div className="fc-ctas" aria-hidden="true" style={{ visibility: "hidden" }}>
              <span className="lp-cta-primary">Claim your pass, free</span>
            </div>
          ) : isFounder ? (
            <div className="fc-done">You&rsquo;re Founding Collector No. {passNumber ? pad(passNumber) : "★"}. Your lifetime Pro is active, and your name is on the wall.</div>
          ) : soldOut ? (
            <div className="fc-done">All {CAP} passes are claimed. Thank you to every one of them.</div>
          ) : !user ? (
            <div className="fc-ctas">
              <Link href="/signup" className="lp-cta-primary">Claim your pass, free</Link>
              <Link href="/login?next=/founding-collectors" className="fc-ghost">I have an account →</Link>
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
        </div>

        <div className="fc-pass-wrap" aria-hidden="true">
          <div className="fc-pass">
            <div className="fc-pass-shine" />
            <div className="fc-pass-top">
              <Image src="/img/logos/cc_badge.png" alt="" width={44} height={44} />
              <span>ComixCatalog</span>
            </div>
            <div className="fc-pass-title">Founding<br />Collector</div>
            <div className="fc-pass-sub">Collector Pro · for life</div>
            <div className="fc-pass-no">
              <span>No.</span> {!claimStateKnown ? "—" : isFounder ? (passNumber ? pad(passNumber) : "★") : nextNumber == null ? "—" : pad(nextNumber)}
              <em> / {CAP}</em>
            </div>
          </div>
        </div>
      </section>

      <section className="fc-slots-section" aria-label={claimed == null ? "Founding passes" : `${claimed} of ${CAP} founding passes claimed`}>
        <div className="fc-slots-head">
          <h2>The first hundred</h2>
          {claimed != null && <p><b>{claimed}</b> claimed · <b>{remaining}</b> left</p>}
        </div>
        <div className="fc-slots">
          {Array.from({ length: CAP }, (_, i) => {
            const founder = byNumber.get(i + 1);
            const isClaimed = Boolean(founder) || (claimed != null && i < claimed);
            const className = `fc-slot${isClaimed ? " is-claimed" : ""}${claimed != null && i === claimed ? " is-next" : ""}`;
            if (!isClaimed) return <span key={i} className={className} />;
            // Every claimed block has its pass number stamped in the gold.
            // Founders still on the stock mask get their initial struck in;
            // an uploaded photo or a picked icon shows as is. Private
            // founders are a numbered block with no name.
            const no = <span className="fc-slot-no">{pad(i + 1)}</span>;
            if (!founder?.username) {
              return <span key={i} className={`${className} is-stamped`}>{no}</span>;
            }
            return (
              <Link
                key={i}
                prefetch={false}
                href={`/u/${encodeURIComponent(founder.username)}`}
                className={`${className} is-stamped`}
                title={`No. ${pad(founder.number)} · @${founder.username}`}
                aria-label={`No. ${pad(founder.number)}, @${founder.username}`}
              >
                {founder.defaultAvatar && founder.initial ? (
                  <span className="fc-slot-mono" aria-hidden="true">{founder.initial}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={founder.avatar} alt="" loading="lazy" />
                )}
                {no}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="fc-perks">
        <h2>What you keep, for life</h2>
        <div className="fc-perk-grid">
          <div className="fc-perk"><b>Grading &amp; slab tools</b><span>Grades, slab company and cert numbers on every book.</span></div>
          <div className="fc-perk"><b>Insurance-ready exports</b><span>The PDF with covers, grades and values, plus full CSV.</span></div>
          <div className="fc-perk"><b>Imports &amp; run tools</b><span>Bulk imports, catalog linking and completion tracking.</span></div>
          <div className="fc-perk"><b>The badge</b><span>A permanent Founding Collector badge on your profile.</span></div>
        </div>
      </section>

      {publicRoster.length > 0 && (
        <section className="fc-roll">
          <div className="fc-roll-head">
            <p className="fc-kicker">Roll of Honor</p>
            <h2>The ones who were here first.</h2>
          </div>
          <ol className="fc-roll-list">
            {publicRoster.map((f) => (
              <li key={f.number}>
                <span className="fc-roll-no">{pad(f.number)}</span>
                {f.defaultAvatar && f.initial ? (
                  <span className="fc-roll-avatar fc-roll-mono" aria-hidden="true">{f.initial}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fc-roll-avatar" src={f.avatar} alt="" loading="lazy" width={28} height={28} />
                )}
                <Link prefetch={false} href={`/u/${encodeURIComponent(f.username)}`}>@{f.username}</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="fc-note">
        <p>
          Every one of these people signed up before this place had much to
          show for itself. They&rsquo;re the ones telling me what&rsquo;s broken
          and what to build next. That deserves more than a discount.
        </p>
        <p className="fc-sign">Tony, founder</p>
      </section>

      <p className="founding-terms fc-terms">
        Lifetime means the lifetime of your ComixCatalog account and the ComixCatalog service. The pass is non-transferable and covers the standard Collector Pro feature set; marketplace fees, third-party data costs, physical services, and unrelated future products are not included.
      </p>
    </main>
  );
}
