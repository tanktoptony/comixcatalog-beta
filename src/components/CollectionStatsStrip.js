// CollectionStatsStrip — the canonical 6-card stats row used on both
// /library (owner management view) and /u/[username] (public showcase view).
//
// Per docs/unify-library-profile.md (the unify design doc), both surfaces
// previously rendered DIFFERENT stats — owner saw Unique Series + Publishers
// + Newest Year, public saw Owned + Wantlist + For Sale + Collection Value
// + Slabbed. Two views of the same data with different curations. Phase 1
// added the missing cards to /library. Phase 2 (this file) makes them
// literally the same component so future stat changes don't drift.
//
// Visibility is controlled via the `visibility` prop:
//   { wantlist?: boolean, for_sale?: boolean, value?: boolean }
// Defaults to true. The owner always sees everything (the caller passes
// isOwner-derived flags from profile.show_*); a non-owner viewing a public
// profile gets only what privacy settings allow.

"use client";

import { useMemo } from "react";

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// Pull a numeric value for a row, preferring user-entered market_value over
// the auto-valuation when both exist. autoMap is keyed by collection.id
// (the shape /api/library-hydrate returns) and may be undefined on the
// public profile (where the API resolves values inline into item.market_value
// already). Caller provides whichever they have.
function rowValue(item, autoMap) {
  const user = Number(item.market_value);
  if (!Number.isNaN(user) && user > 0) return user;
  if (autoMap) {
    const auto = Number(autoMap[item.id]?.value);
    if (!Number.isNaN(auto) && auto > 0) return auto;
  }
  return 0;
}

export default function CollectionStatsStrip({
  collection,
  visibility = {},
  autoMarketValues, // optional — only the library page passes this
}) {
  const stats = useMemo(() => {
    let owned = 0;
    let wantlist = 0;
    let forSale = 0;
    let slabbed = 0;
    let value = 0;
    const seriesKeys = new Set();

    for (const item of collection ?? []) {
      if (item.status === "owned") owned += 1;
      else if (item.status === "wishlist") wantlist += 1;
      else if (item.status === "for_sale") forSale += 1;

      if (item.slab_company) slabbed += 1;

      // Value applies only to owned (you don't add wantlist or for-sale
      // asking prices to "collection value"). For-sale gets a separate
      // marketplace dollar amount in Phase 4, not here.
      if (item.status === "owned") {
        value += rowValue(item, autoMarketValues);
      }

      // Unique series key — title (lowercased) + publisher to disambiguate
      // multi-publisher reprints (Conan, Star Wars, etc.).
      const title = String(
        item.display?.title ?? item.comic?.title ?? item.comics?.series_title ?? ""
      ).trim().toLowerCase();
      const publisher = String(
        item.display?.publisher ?? item.comic?.publisher ?? item.comics?.publisher ?? ""
      ).trim().toLowerCase();
      if (title) seriesKeys.add(`${title}::${publisher}`);
    }

    return { owned, wantlist, forSale, slabbed, value, uniqueSeries: seriesKeys.size };
  }, [collection, autoMarketValues]);

  const showWantlist = visibility.wantlist !== false;
  const showForSale = visibility.for_sale !== false;
  const showValue = visibility.value !== false;

  // Render: a 6-card strip. Hidden cards collapse out entirely (no empty
  // placeholders) so a privacy-restricted public view doesn't look broken.
  return (
    <section
      className="collection-stats-strip"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      <StatCard label="Owned" value={stats.owned} />
      {showWantlist && <StatCard label="Wantlist" value={stats.wantlist} />}
      {showForSale && <StatCard label="For Sale" value={stats.forSale} />}
      <StatCard label="Slabbed" value={stats.slabbed} />
      {showValue && (
        <StatCard
          label="Collection Value"
          value={stats.value > 0 ? formatCurrency(stats.value) : "—"}
        />
      )}
      <StatCard label="Unique Series" value={stats.uniqueSeries} />
    </section>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "12px 14px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.72rem", opacity: 0.7, marginTop: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}
