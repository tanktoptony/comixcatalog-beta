// CollectionInsightSidebar — the "About this collection" + "Top publishers"
// sidebar widgets shared by /library and /u/[username].
//
// Per the unify design doc, both pages previously computed Era focus / Slab
// ratio / Top publishers differently. Phase 1 added them to /library; this
// component (Phase 2) is the single source so future changes don't drift.
//
// Cost basis is opt-in via `showCostBasis` since it's owner-only info that
// must NOT appear when a stranger views the public profile.

"use client";

import { useMemo } from "react";

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function normalizePublisher(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown Publisher";
  const lower = raw.toLowerCase();
  if (["marvel", "marvel comics"].includes(lower)) return "Marvel";
  if (["dc", "dc comics"].includes(lower)) return "DC";
  if (["image", "image comics"].includes(lower)) return "Image";
  if (["boom", "boom!", "boom studios", "boom! studios"].includes(lower)) return "Boom";
  if (["idw", "idw publishing"].includes(lower)) return "IDW";
  if (["dark horse", "dark horse comics"].includes(lower)) return "Dark Horse";
  return raw;
}

export default function CollectionInsightSidebar({
  collection,
  showCostBasis = false,
}) {
  const insights = useMemo(() => {
    const decadeCounts = {};
    const publisherCounts = {};
    let owned = 0;
    let slabbed = 0;
    let costBasis = 0;
    let hasCostData = false;
    const seriesKeys = new Set();

    for (const item of collection ?? []) {
      // For Era focus + Top publishers we use the collection-wide signal,
      // not just owned, because someone with 50 wantlist books in Bronze Age
      // titles is still "a Bronze Age collector."
      const year = Number(
        item.display?.year ?? item.comic?.year ?? item.comics?.release_year
      );
      if (year) {
        const decade = Math.floor(year / 10) * 10;
        decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
      }
      const publisher = normalizePublisher(
        item.display?.publisher ?? item.comic?.publisher ?? item.comics?.publisher
      );
      publisherCounts[publisher] = (publisherCounts[publisher] || 0) + 1;

      if (item.status === "owned") {
        owned += 1;
        if (item.slab_company) slabbed += 1;
        if (item.purchase_price != null) {
          const n = Number(item.purchase_price);
          if (!Number.isNaN(n) && n > 0) {
            costBasis += n;
            hasCostData = true;
          }
        }
      }

      const title = String(
        item.display?.title ?? item.comic?.title ?? item.comics?.series_title ?? ""
      ).trim().toLowerCase();
      const pubKey = (item.display?.publisher || item.comic?.publisher || "").trim().toLowerCase();
      if (title) seriesKeys.add(`${title}::${pubKey}`);
    }

    const dominantDecade =
      Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topPublishers = Object.entries(publisherCounts)
      .filter(([name]) => name !== "Unknown Publisher")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const slabRatio = owned > 0 ? Math.round((slabbed / owned) * 100) : 0;

    return {
      dominantDecade,
      slabRatio,
      uniqueSeries: seriesKeys.size,
      topPublishers,
      costBasis,
      hasCostData,
    };
  }, [collection]);

  const hasAny =
    insights.dominantDecade ||
    insights.uniqueSeries > 0 ||
    insights.topPublishers.length > 0;
  if (!hasAny) return null;

  return (
    <>
      {(insights.dominantDecade || insights.uniqueSeries > 0) && (
        <SidebarCard title="About this collection">
          <dl style={dlStyle}>
            {insights.dominantDecade && (
              <Row label="Era focus" value={`${insights.dominantDecade}s`} />
            )}
            <Row label="Slab ratio" value={`${insights.slabRatio}%`} />
            {insights.uniqueSeries > 0 && (
              <Row label="Unique series" value={insights.uniqueSeries} />
            )}
            {showCostBasis && insights.hasCostData && (
              <Row label="Cost basis" value={formatCurrency(insights.costBasis)} />
            )}
          </dl>
        </SidebarCard>
      )}

      {insights.topPublishers.length > 0 && (
        <SidebarCard title="Top publishers">
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {insights.topPublishers.map(([name, count]) => (
              <li key={name} style={publisherRowStyle}>
                <span style={{ opacity: 0.85 }}>{name}</span>
                <span style={{ fontWeight: 600, opacity: 0.65 }}>{count}</span>
              </li>
            ))}
          </ul>
        </SidebarCard>
      )}
    </>
  );
}

const dlStyle = {
  margin: 0,
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  rowGap: 6,
  columnGap: 12,
  fontSize: "0.85rem",
};

const publisherRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 0",
  fontSize: "0.85rem",
  borderTop: "1px solid rgba(255,255,255,0.05)",
};

function SidebarCard({ title, children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <>
      <dt style={{ opacity: 0.65 }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>{value}</dd>
    </>
  );
}
