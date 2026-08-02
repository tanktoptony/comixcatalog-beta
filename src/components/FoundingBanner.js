"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function FoundingBanner() {
  const [remaining, setRemaining] = useState(83);

  useEffect(() => {
    fetch("/api/founding/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isFinite(data?.remaining)) setRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  if (remaining < 1) return null;
  return (
    <div className="founding-banner" role="region" aria-label="Founding Collector offer">
      <div className="founding-banner-inner">
        <span className="founding-banner-count">{remaining}</span>
        <p><strong>free lifetime Pro passes remain.</strong> Catalog 10 comics and claim yours—no card required.</p>
        <Link href="/founding-collectors" className="founding-banner-cta">Claim yours →</Link>
      </div>
    </div>
  );
}
