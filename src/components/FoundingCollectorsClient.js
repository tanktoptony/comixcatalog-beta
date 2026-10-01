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

export default function FoundingCollectorsClient({ initialRemaining = null, roster = [] }) {
  const { user } = useAuth();
  const [status, setStatus] = useState({ remaining: initialRemaining, isFounding: false, canClaim: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = user ? await authedFetch("/api/founding/status", { cache: "no-store" }) : await fetch("/api/founding/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
  }
  useEffect(() => {
    let cancelled = false;
    const request = user ? authedFetch("/api/founding/status", { cache: "no-store" }) : fetch("/api/founding/status", { cache: "no-store" });
    request.then((response) => response.ok ? response.json() : null).then((data) => {
      if (!cancelled && data) setStatus(data);
    });
    return () => { cancelled = true; };
  }, [user]);

  async function claim() {
    setBusy(true); setMessage("");
    const response = await authedFetch("/api/founding/status", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage(data.error || "Could not activate your membership");
    setMessage("Your Founding Collector pass is active. Welcome to Pro for life.");
    await load();
  }

  const remaining = status.remaining;
  const claimed = remaining == null ? null : Math.max(0, CAP - remaining);
  const nextNumber = claimed == null ? null : Math.min(CAP, claimed + 1);
  const soldOut = remaining === 0;

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

          {status.isFounding ? (
            <div className="fc-done">You&rsquo;re a Founding Collector. Your lifetime Pro is active, and your name is on the wall.</div>
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
              <span>No.</span> {status.isFounding ? "★" : nextNumber == null ? "—" : pad(nextNumber)}
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
          {Array.from({ length: CAP }, (_, i) => (
            <span
              key={i}
              className={`fc-slot${claimed != null && i < claimed ? " is-claimed" : ""}${claimed != null && i === claimed ? " is-next" : ""}`}
            />
          ))}
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

      {roster.length > 0 && (
        <section className="fc-roll">
          <div className="fc-roll-head">
            <p className="fc-kicker">Roll of Honor</p>
            <h2>The ones who were here first.</h2>
          </div>
          <ol className="fc-roll-list">
            {roster.map((f) => (
              <li key={f.number}>
                <span className="fc-roll-no">{pad(f.number)}</span>
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
