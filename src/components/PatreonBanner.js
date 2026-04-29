"use client";

import { useEffect, useState } from "react";

// Site-wide top banner promoting the Patreon. Sticks around until the user
// dismisses it; dismissal persists in localStorage. Loud gold strip,
// compact single-line layout on desktop, stacks cleanly on mobile.
//
// Styles are inlined here (instead of in globals.css) because dev-server
// CSS hot-reload was unreliable on the first ship of this component and we
// want it to render correctly the instant a page loads, regardless of
// whether the CSS chunk picked up the latest rules.

const STORAGE_KEY = "cc_patreon_banner_dismissed_v1";
const PATREON_URL = "https://www.patreon.com/cw/ComixCatalog";

const wrapperStyle = {
  background: "linear-gradient(90deg, #f4d03f 0%, #ffb84d 50%, #f4d03f 100%)",
  color: "#0b1230",
  borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
};

const innerStyle = {
  maxWidth: 1280,
  margin: "0 auto",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "9px clamp(1rem, 3vw, 2rem)",
  flexWrap: "wrap",
  fontWeight: 500,
};

const pillStyle = {
  flexShrink: 0,
  background: "#0b1230",
  color: "#f4d03f",
  fontSize: "0.62rem",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "4px 9px",
  borderRadius: 999,
};

const copyStyle = {
  flex: "1 1 auto",
  margin: 0,
  fontSize: "0.9rem",
  lineHeight: 1.4,
  minWidth: 0,
};

const ctaStyle = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  background: "#0b1230",
  color: "#f4d03f",
  fontSize: "0.85rem",
  fontWeight: 800,
  letterSpacing: "0.04em",
  padding: "8px 16px",
  borderRadius: 6,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const closeStyle = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  color: "rgba(11, 18, 48, 0.7)",
  border: 0,
  width: 28,
  height: 28,
  fontSize: "1.3rem",
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: 4,
  lineHeight: 1,
};

export default function PatreonBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === "true";
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
  }

  if (!visible) return null;

  return (
    <div
      style={wrapperStyle}
      role="region"
      aria-label="Founding Collector campaign"
    >
      <div style={innerStyle}>
        <span style={pillStyle}>Limited</span>
        <p style={copyStyle}>
          <strong style={{ fontWeight: 800 }}>Founding Collector</strong>{" "}
          memberships are open — permanent badge, founders-page recognition,
          early access.
        </p>
        <a
          href={PATREON_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={ctaStyle}
        >
          Join on Patreon →
        </a>
        <button
          type="button"
          onClick={dismiss}
          style={closeStyle}
          aria-label="Dismiss banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
