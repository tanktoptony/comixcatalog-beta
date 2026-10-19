/* eslint-disable @next/next/no-img-element */
import { theme } from "./theme";
import { fitTitle } from "./helpers";

export function Slab({ src, title = "COMIC", issue = "", width = 300, height = 450 }) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        overflow: "hidden",
        border: "2px solid rgba(255,255,255,.85)",
        borderRadius: 8,
        background: theme.surface2,
        boxShadow: "0 22px 45px rgba(0,0,0,.55)",
      }}
    >
      {src ? (
        <img
          alt=""
          src={src}
          width={width}
          height={height}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            padding: 24,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            color: theme.text,
            fontFamily: "Big Shoulders",
            fontWeight: 800,
            fontSize: Math.min(42, fitTitle(title)),
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          <span>{title}</span>
          <span style={{ color: theme.gold, fontSize: 54 }}>{issue}</span>
        </div>
      )}
    </div>
  );
}

export function StatTile({ value, label }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 125,
        padding: "12px 16px",
        border: `1px solid ${theme.line}`,
        borderRadius: 10,
        background: theme.surface,
      }}
    >
      <span style={{ color: theme.text, fontFamily: "Inter", fontWeight: 800, fontSize: 28 }}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </span>
      <span
        style={{
          color: theme.muted,
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function BrandBar() {
  return (
    <div
      style={{
        position: "absolute",
        left: 56,
        right: 56,
        bottom: 24,
        height: 42,
        borderTop: `1px solid ${theme.line}`,
        paddingTop: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: theme.gold,
          fontFamily: "Big Shoulders",
          fontWeight: 800,
          fontSize: 25,
          letterSpacing: 2,
        }}
      >
        COMIXCATALOG
      </span>
      <span style={{ color: theme.muted, fontFamily: "Inter", fontSize: 16 }}>comixcatalog.com</span>
    </div>
  );
}
