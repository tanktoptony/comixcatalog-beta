"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

export default function FoundingCollectorsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState({ remaining: 83, requiredBooks: 10, eligibleBooks: 0 });
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
    if (!response.ok) return setMessage(data.error || "Could not claim your pass");
    setMessage("Your Founding Collector pass is active. Welcome to Pro for life.");
    await load();
  }

  const progress = Math.min(status.eligibleBooks || 0, status.requiredBooks || 10);
  return (
    <main className="founding-page">
      <section className="founding-hero">
        <div className="section-label badge-x">Founding Collectors</div>
        <div className="founding-number">{status.remaining}</div>
        <h1>free lifetime Pro passes remain.</h1>
        <p>Help shape ComixCatalog from the beginning. Create your account, catalog 10 comics, and keep Collector Pro for the lifetime of your account—no card required.</p>
        {status.isFounding ? (
          <div className="founding-success">You’re a Founding Collector. Your lifetime Pro access is active.</div>
        ) : !user ? (
          <Link href="/signup" className="primary-btn">Create your free account</Link>
        ) : (
          <div className="founding-claim-box">
            <strong>{progress} of {status.requiredBooks} comics cataloged</strong>
            <div className="founding-progress"><span style={{ width: `${(progress / status.requiredBooks) * 100}%` }} /></div>
            {status.canClaim ? <button className="primary-btn" onClick={claim} disabled={busy}>{busy ? "Claiming…" : "Claim lifetime Pro"}</button> : <Link href="/library/add" className="primary-btn">Add comics to qualify</Link>}
          </div>
        )}
        {message && <p className="founding-message">{message}</p>}
      </section>
      <section className="founding-details">
        <h2>What you keep</h2>
        <ul><li>Collector Pro grading and slab tools</li><li>Insurance-ready PDF and full CSV exports</li><li>Expanded imports, catalog linking, and completion tools</li><li>A permanent Founding Collector profile badge</li></ul>
        <p className="founding-terms">Lifetime means the lifetime of your ComixCatalog account and the ComixCatalog service. The pass is non-transferable and covers the standard Collector Pro feature set; marketplace fees, third-party data costs, physical services, and unrelated future products are not included.</p>
      </section>
    </main>
  );
}
