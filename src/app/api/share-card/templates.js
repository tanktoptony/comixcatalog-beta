import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCollectionCard } from "@/lib/shareCards/loadCollection";
import { possessive } from "@/lib/shareCards/collectionStats";

// Share card registry. Each entry is { load(supabase, userId), render(data) }
// and owns its own layout. Adding "My Wantlist", "Run Completed", etc. later
// is a new entry here, with no change to the route or the client button.
//
// Every card is 1080×1920, an Instagram Story. Instagram lays its own UI
// over roughly the top 250px (progress bar, avatar) and bottom 250px (reply
// bar) of a Story, so everything that matters sits between y≈260 and y≈1660.

export const CARD_SIZE = { width: 1080, height: 1920 };

// Satori's built-in font has a single weight, so every "bold" renders thin
// and the card reads flat. These are bundled instead: Big Shoulders is the
// site's own display face (--font-display, the public profile), Inter does
// the small labels. Both SIL Open Font License. next.config.mjs traces this
// folder into the route's serverless bundle (outputFileTracingIncludes).
const FONT_DIR = join(process.cwd(), "src/app/api/share-card/fonts");
let fontsPromise = null;
export function loadFonts() {
  fontsPromise ??= Promise.all([
    readFile(join(FONT_DIR, "BigShouldersDisplay-ExtraBold.ttf")),
    readFile(join(FONT_DIR, "Inter-SemiBold.ttf")),
    readFile(join(FONT_DIR, "Inter-ExtraBold.ttf")),
  ])
    .then(([display, semi, extra]) => [
      { name: "Display", data: display, weight: 800, style: "normal" },
      { name: "Inter", data: semi, weight: 600, style: "normal" },
      { name: "Inter", data: extra, weight: 800, style: "normal" },
    ])
    .catch((err) => {
      // Don't cache a failure; the next request retries.
      fontsPromise = null;
      throw err;
    });
  return fontsPromise;
}

const NAVY = "#0B1E6B";
const NAVY_DEEP = "#060F3D";
const GOLD = "#F4D03F";
const INK = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.72)";


// The name line never wraps. It used to be sized from string length alone,
// and Satori wrapped anything long: a 60-character display name ran to five
// lines and pushed the URL off the card. Now:
//   - a display name longer than 16 characters is replaced by the username
//     (max 20, [a-z0-9_]), which is shorter and is what people know them by;
//   - the size comes from an estimated width. Big Shoulders ExtraBold caps
//     average ~0.5em (W/M run wider), so 0.56em per character is a
//     conservative bound for the 920px column;
//   - nowrap + ellipsis is the backstop if the estimate is ever wrong.
const TITLE_WIDTH = 920;
function titleSize(text) {
  return Math.max(72, Math.min(210, Math.floor(TITLE_WIDTH / (text.length * 0.56))));
}

function cardName(displayName, username) {
  const d = String(displayName ?? "").trim();
  return d && d.length <= 16 ? d : username;
}

function CollectionCard({ username, displayName, stats, covers }) {
  const owner = possessive(cardName(displayName, username));
  const fan = covers.slice(0, 3);
  const rotations = fan.length === 3 ? [-8, 0, 8] : fan.length === 2 ? [-5, 5] : [0];
  const offsets = fan.length === 3 ? [-230, 0, 230] : fan.length === 2 ? [-120, 120] : [0];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(170deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        color: INK,
        fontFamily: "Inter",
        position: "relative",
        // Top and bottom padding keep everything inside Instagram's safe zone.
        padding: "260px 80px 260px",
      }}
    >
      {/* gold rule down the left edge: the one piece of branding that reads
          at a glance without taking any space from the content */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: GOLD, display: "flex" }} />

      <div style={{ display: "flex", fontSize: 32, fontWeight: 800, letterSpacing: 8, color: GOLD }}>
        MY COMIXCATALOG
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 44, fontFamily: "Display" }}>
        <div
          style={{
            display: "block",
            maxWidth: TITLE_WIDTH,
            fontSize: titleSize(owner),
            fontWeight: 800,
            lineHeight: 0.95,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {owner}
        </div>
        <div style={{ display: "flex", fontSize: 130, fontWeight: 800, lineHeight: 0.95, color: GOLD }}>
          COLLECTION
        </div>
      </div>

      {fan.length > 0 && (
        <div style={{ display: "flex", position: "relative", height: 420, marginTop: 44 }}>
          {/* covers are data URIs prepared by the loader (loadCollection.js) */}
          {fan.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              width={256}
              height={384}
              style={{
                position: "absolute",
                left: 460 - 128 + offsets[i],
                top: i === 1 && fan.length === 3 ? 0 : 30,
                width: 256,
                height: 384,
                objectFit: "cover",
                borderRadius: 10,
                border: "5px solid #FFFFFF",
                // No box-shadow: its blur was the single most expensive part
                // of the render (several seconds in resvg).
                transform: `rotate(${rotations[i]}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", marginTop: fan.length > 0 ? 30 : 80, gap: 70 }}>
        <Stat value={stats.owned} label={stats.owned === 1 ? "COMIC" : "COMICS"} />
        <Stat value={stats.series} label="SERIES" />
        {stats.wanted > 0 && <Stat value={stats.wanted} label="WANTED" />}
      </div>

      {stats.publishers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44, gap: 18 }}>
          {stats.publishers.map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ display: "flex", width: 230, fontSize: 36, fontWeight: 800 }}>{p.name}</div>
              <div style={{ display: "flex", flex: 1, height: 24, borderRadius: 12, background: "rgba(255,255,255,0.12)" }}>
                <div style={{ display: "flex", width: `${Math.max(p.pct, 2)}%`, height: 24, borderRadius: 12, background: GOLD }} />
              </div>
              <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontSize: 36, fontWeight: 800, color: GOLD }}>
                {p.pct}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* In the flow, pushed to the bottom of the safe zone. It was absolutely
          positioned once and sat on top of a fourth publisher row. */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          paddingTop: 30,
          flexShrink: 0,
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: INK }}>comixcatalog.com</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: MUTED }}>@{username}</div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontFamily: "Display", fontSize: 170, fontWeight: 800, lineHeight: 0.9, color: INK }}>
        {value.toLocaleString("en-US")}
      </div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 5, color: GOLD, marginTop: 8 }}>
        {label}
      </div>
    </div>
  );
}

export const TEMPLATES = {
  collection: {
    load: loadCollectionCard,
    render: (data) => <CollectionCard {...data} />,
    // Nothing worth posting until there is at least one owned book.
    isEmpty: (data) => data.stats.owned === 0,
    filename: "comixcatalog-collection.png",
  },
};
