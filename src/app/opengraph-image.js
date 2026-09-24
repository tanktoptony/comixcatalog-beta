import { ImageResponse } from "next/og";

// Dynamic Open Graph image — what Facebook, Discord, iMessage, X,
// LinkedIn, Slack, and every other link-unfurler renders when our site
// is shared. 1200×630 is the spec all of them target.
//
// Note: keep this on the Node runtime (default). Edge runtime + Satori
// has trouble resolving system fonts, which causes the route to throw
// with "missing font" before even attempting to render. Node has all
// the fonts the OS has, so the same JSX renders without ceremony.
//
// LAYOUT, and why it is a fan rather than a grid (rebuilt 2026-09-24):
//
// The previous version laid six covers out as 3 rows × 2 columns at
// 262px tall with 14px gaps, positioned 40px from the top. That needs
// 3×262 + 2×14 + 40 = 854px of a canvas that is 630px tall, so the
// bottom row was sliced through the middle on every share, everywhere.
// Nobody notices this locally because the route renders fine — you only
// see it in the unfurl.
//
// So: three covers, sized and placed to fit with room to spare, with
// every number below checked against the 1200×630 frame.
export const alt = "ComixCatalog — your collection, and its value, in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Three covers chosen to read at a glance against a navy field: one dark
// and iconic, one bright, one light. A six-cover grid was mostly texture
// at this size; three at nearly twice the size are actually legible, which
// is the entire job of this image.
//
// If a path goes stale (404 from storage) that slot renders as an empty
// card rather than breaking the image.
const COVERS = [
  { path: "comicvine/absolute-batman/1136229-vol-1-the-zoo.jpg", rotate: -7 },
  { path: "comicvine/ultimate-spider-man/vol-48343/333461-cake-ultimate-peter-parker.jpg", rotate: 1 },
  { path: "comicvine/saga/vol-46568/321297-chapter-one.jpg", rotate: 9 },
];

// Geometry, stated rather than discovered:
//   card 212 × 318 (the 2:3 a comic cover actually is)
//   step 162 between card left edges, so they overlap by 50
//   width used: 212 + 2×162 = 536, from x=640 → 1176, leaving a 24px margin
//   vertical: centred on 315, so 156 → 474; ±9° rotation adds ~26px of
//   corner, which still lands well inside 0–630
//
// The fan starts at 640 rather than tighter, because the text column needs
// 520px of usable width to set "Your collection," on ONE line. Crowding the
// fan leftwards broke the headline to four lines, which reads worse than
// slightly smaller covers.
//
// The overlap is 52 rather than the 86 a first pass used. A comic cover
// carries its logo down the LEFT edge, so an aggressive fan reads as
// "BATMA" and "FROM YO" — recognisable to nobody. 52 is the most overlap
// that still leaves each masthead whole.
const CARD_W = 212;
const CARD_H = 318;
const STEP = 162;
const FAN_LEFT = 640;
const FAN_TOP = 156;

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0B1E6B",
          position: "relative",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Warm lift behind the fan so the cards sit in light rather than
            floating on flat navy. Larger and closer to the covers than the
            old top-left spotlight, which was too faint to register. */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: 560,
            width: 760,
            height: 760,
            background: "radial-gradient(circle, rgba(244, 208, 63, 0.22), transparent 62%)",
          }}
        />

        {/* LEFT COLUMN — text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 40px 60px 70px",
            width: 630,
            zIndex: 2,
          }}
        >
          <div
            style={{
              color: "#F4D03F",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 4,
              marginBottom: 28,
            }}
          >
            COMIXCATALOG
          </div>

          <div
            style={{
              color: "#fff",
              fontSize: 62,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Your collection,</span>
            <span>and its value,</span>
            <span>in one place.</span>
          </div>

          <div
            style={{
              width: 72,
              height: 4,
              background: "#F4D03F",
              borderRadius: 999,
              marginTop: 36,
              marginBottom: 22,
            }}
          />

          <div
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 24,
              fontWeight: 500,
            }}
          >
            comixcatalog.com
          </div>
        </div>

        {/* RIGHT — the fan. Absolutely positioned per card so the overlap
            and rotation are explicit numbers rather than flex side effects,
            which is what let the old version silently overflow. */}
        {COVERS.map((cover, i) => (
          <div
            key={cover.path}
            style={{
              position: "absolute",
              left: FAN_LEFT + i * STEP,
              top: FAN_TOP,
              width: CARD_W,
              height: CARD_H,
              display: "flex",
              borderRadius: 10,
              overflow: "hidden",
              background: "#111a38",
              // A pale edge reads as a slab case, which is the right
              // association for a site about what a collection is worth,
              // and it keeps a dark cover from dissolving into the navy.
              border: "3px solid rgba(255,255,255,0.88)",
              boxShadow: "0 22px 44px rgba(0,0,0,0.55)",
              transform: `rotate(${cover.rotate}deg)`,
              zIndex: 3 + i,
            }}
          >
            <img
              src={`${SUPABASE_URL}/storage/v1/object/public/canonical-covers/${cover.path}`}
              alt=""
              width={CARD_W}
              height={CARD_H}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ))}
      </div>
    ),
    { ...size }
  );
}
