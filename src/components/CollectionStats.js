"use client";

export default function CollectionStats({ collections }) {
  const total = collections.length;

  const owned = collections.filter(
    (c) => c.status === "owned"
  ).length;

  const wishlist = collections.filter(
    (c) => c.status === "wishlist"
  ).length;

  const forSale = collections.filter(
    (c) => c.status === "for_sale"
  ).length;

  const slabbed = collections.filter(
    (c) => c.slab_comp && c.grade_num
  ).length;

  const raw = total - slabbed;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "1rem",
        marginBottom: "2rem"
      }}
    >
      <Stat label="Total Books" value={total} />
      <Stat label="Owned" value={owned} />
      <Stat label="Wishlist" value={wishlist} />
      <Stat label="For Sale" value={forSale} />
      <Stat label="Slabbed" value={slabbed} />
      <Stat label="Raw" value={raw} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div
      style={{
        background: "#111",
        padding: "1rem",
        borderRadius: "8px",
        textAlign: "center"
      }}
    >
      <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
        {label}
      </div>
    </div>
  );
}