import { ImageResponse } from "next/og";

// Dynamic Open Graph image — what Facebook, Discord, iMessage, X,
// LinkedIn, Slack, and every other link-unfurler renders when our site
// is shared. 1200×630 is the spec all of them target.
//
// Using next/og's ImageResponse means:
//   • The PNG is generated on-demand by Next at the edge
//   • Real comic covers from canonical-covers (not AI silhouettes)
//   • Brand colors, exact dimensions, every time
//   • Per-page overrides are now trivial (just add an
//     opengraph-image.js inside any route folder)

// Note: keep this on the Node runtime (default). Edge runtime + Satori
// has trouble resolving system fonts, which causes the route to throw
// with "missing font" before even attempting to render. Node has all
// the fonts the OS has, so the same JSX renders without ceremony.
export const alt = "ComixCatalog — your collection, and its value, in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Six recognizable, in-database series covers. Pulled from canonical_covers
// in /scripts work — if any go stale (404 from supabase), the cover slot
// just renders as a dark rectangle and the rest of the image is unaffected.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const COVER_PATHS = [
  "comicvine/absolute-batman/1136229-vol-1-the-zoo.jpg",
  "comicvine/saga/vol-46568/321297-chapter-one.jpg",
  "comicvine/ultimate-spider-man/vol-48343/333461-cake-ultimate-peter-parker.jpg",
  "comicvine/the-amazing-spider-man/vol-87154/510489-volume-1.jpg",
  "comicvine/daredevil/vol-2190/7067-the-origin-of-daredevil.jpg",
  "comicvine/the-x-men/6694-x-men.jpg",
];
const COVER_URLS = COVER_PATHS.map(
  (p) => `${SUPABASE_URL}/storage/v1/object/public/canonical-covers/${p}`
);

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
        {/* Gold radial spotlight in top-left corner */}
        <div
          style={{
            position: "absolute",
            top: -200,
            left: -200,
            width: 700,
            height: 700,
            background:
              "radial-gradient(circle, rgba(244, 208, 63, 0.25), transparent 60%)",
          }}
        />

        {/* LEFT COLUMN — text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 50px 60px 70px",
            width: 680,
            zIndex: 1,
          }}
        >
          {/* Wordmark */}
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

          {/* Headline — three-line statement */}
          <div
            style={{
              color: "#fff",
              fontSize: 76,
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

          {/* Gold accent rule */}
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

          {/* URL */}
          <div
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 24,
              fontWeight: 500,
            }}
          >
            comixcatalog.com
          </div>
        </div>

        {/* RIGHT COLUMN — cover grid (2 cols × 3 rows) */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 720,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            transform: "rotate(-3deg)",
          }}
        >
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              style={{
                display: "flex",
                gap: 14,
              }}
            >
              {[0, 1].map((col) => {
                const idx = row * 2 + col;
                const url = COVER_URLS[idx];
                return (
                  <div
                    key={col}
                    style={{
                      width: 175,
                      height: 262,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#1a2547",
                      boxShadow: "0 16px 30px rgba(0,0,0,0.5)",
                      display: "flex",
                    }}
                  >
                    {url && (
                      <img
                        src={url}
                        alt=""
                        width={175}
                        height={262}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Subtle vignette on the right edge so the cover grid fades into
            the background instead of butting against the frame edge. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 200,
            height: "100%",
            background:
              "linear-gradient(to left, rgba(11, 30, 107, 0.6), transparent)",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
