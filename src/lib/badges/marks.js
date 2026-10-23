// The artwork in the middle of each badge patch, as SVG markup in a 128x128
// box. One source for the page component (Badge.js) and the share-card image
// (svg.js), so a new mark can't render on one and print its name on the other.
// `ink` is the mark colour for the patch shape: navy on gold hexes, gold on
// blue circles and shields.

const ICONS = {
  key: (ink) => `<g transform="translate(64 66)" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"><circle cx="-14" r="13"/><path d="M-1 0h31M18 0v11M28 0v8"/></g>`,
  check: (ink) => `<path d="m40 64 17 17 33-35" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  slab: () => `<g><rect x="44" y="32" width="40" height="62" rx="4" fill="#0b1e5b"/><rect x="50" y="38" width="28" height="9" fill="#f6cf2e"/><rect x="50" y="51" width="28" height="36" fill="#fbf6e6"/></g>`,
  star: (ink) => `<path d="M64 30l9.4 19 21 3-15.2 14.8 3.6 20.9L64 77.8 45.2 87.7l3.6-20.9L33.6 52l21-3Z" fill="${ink}"/>`,
  ages: (ink) => `<g fill="${ink}"><rect x="34" y="70" width="10" height="20" rx="2"/><rect x="47" y="60" width="10" height="30" rx="2"/><rect x="60" y="50" width="10" height="40" rx="2"/><rect x="73" y="42" width="10" height="48" rx="2"/><rect x="86" y="34" width="10" height="56" rx="2"/></g>`,
  follow: (ink) => `<g fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"><circle cx="56" cy="52" r="13"/><path d="M34 92c3-15 12-22 22-22s19 7 22 22"/><path d="M90 50v24M78 62h24"/></g>`,
  invite: (ink) => `<g fill="none" stroke="${ink}" stroke-width="7" stroke-linejoin="round"><rect x="32" y="42" width="64" height="46" rx="5"/><path d="M34 46l30 22 30-22"/></g>`,
  heart: (ink) => `<path d="M64 92S34 74 34 54c0-10 8-17 17-17 6 0 10 3 13 8 3-5 7-8 13-8 9 0 17 7 17 17 0 20-30 38-30 38Z" fill="${ink}"/>`,
  scan: (ink) => `<g fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="32" y="46" width="64" height="42" rx="6"/><path d="M52 46l5-8h14l5 8"/><circle cx="64" cy="67" r="10"/></g>`,
};

const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

// Text marks (milestone numbers, publisher names, "9.8") shrink to fit.
export function textMarkSize(text) {
  const length = String(text ?? "").length;
  if (length <= 2) return 40;
  if (length <= 3) return 34;
  if (length <= 5) return 25;
  return 20;
}

export function markSvg(badge, { foundingNumber, fontFamily = "inherit" } = {}) {
  const ink = badge.shape === "hex" ? "#0b1e5b" : "#f6cf2e";
  if (badge.mark === "founding") {
    const number = `No.${String(foundingNumber ?? "").padStart(3, "0")}`;
    return `<text x="64" y="61" text-anchor="middle" font-family="${fontFamily}" font-size="10" font-weight="700" letter-spacing="1" fill="#fbf6e6">FOUNDING</text>`
      + `<text x="64" y="91" text-anchor="middle" font-family="${fontFamily}" font-size="30" font-weight="800" fill="${ink}">${escapeXml(number)}</text>`;
  }
  const icon = ICONS[badge.mark];
  if (icon) return icon(ink);
  const size = textMarkSize(badge.mark);
  return `<text x="64" y="${64 + size * 0.36}" text-anchor="middle" font-family="${fontFamily}" font-size="${size}" font-weight="800" fill="${ink}">${escapeXml(badge.mark)}</text>`;
}

export const ICON_MARKS = Object.freeze(Object.keys(ICONS));
