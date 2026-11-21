import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCollectionCard } from "@/lib/shareCards/loadCollection";
import { possessive } from "@/lib/shareCards/collectionStats";
import { loadFoundingCard } from "@/lib/shareCards/loadFounding";
import { loadListCard } from "@/lib/shareCards/loadList";

// Share card registry. Each entry is { load(supabase, userId), render(data) }
// and owns its own layout. Adding "My Wantlist", "Run Completed", etc. later
// is a new entry here, with no change to the route or the client button.
//
// Every card is 1080×1920, an Instagram Story. Instagram lays its own UI
// over roughly the top 250px (progress bar, avatar) and bottom 250px (reply
// bar) of a Story, so everything that matters sits between y≈260 and y≈1660.

export const CARD_SIZE = { width: 1080, height: 1920 };
export const LIST_SIZE = { width: 1080, height: 1350 };

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

function CollectionCard({ username, displayName, stats, covers, hasHighlights = false }) {
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

      {fan.length > 0 && hasHighlights && (
        <div style={{ display: "flex", marginTop: 44, fontSize: 24, fontWeight: 800, letterSpacing: 4, color: GOLD }}>
          HIGHLIGHTS
        </div>
      )}
      {fan.length > 0 && (
        <div style={{ display: "flex", position: "relative", height: 420, marginTop: hasHighlights ? 20 : 44 }}>
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


// Founding Collector post (1080x1350, Instagram's 4:5 feed size): a gold
// foil pass tilted on the right, its face a mosaic of the founder's own
// covers fading into navy under a big foil number. Drawn at 2x the
// 540x675 design on the concept board.
export const FOUNDING_SIZE = { width: 1080, height: 1350 };
const FOIL = "linear-gradient(135deg, #fff1a8 0%, #c99a1c 22%, #f6d65a 45%, #8a6408 70%, #f4d03f 100%)";
const FOIL_TEXT = "linear-gradient(175deg, #fff6c9 0%, #f4d03f 35%, #b8860b 70%, #f8dc5c 100%)";
const pad3 = (n) => String(n).padStart(3, "0");

function FoundingCard({ number, username, covers }) {
  const no = pad3(number);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        padding: 72,
        color: INK,
        fontFamily: "Inter",
        backgroundColor: "#03061a",
        backgroundImage: "radial-gradient(90% 70% at 70% 35%, #1a3390 0%, #071033 55%, #03061a 100%)",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 8 }}>COMIXCATALOG</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 52, fontFamily: "Display", fontSize: 112, fontWeight: 800, lineHeight: 0.92 }}>
        <div style={{ display: "flex" }}>I&rsquo;M ONE</div>
        <div style={{ display: "flex" }}>OF THE</div>
        <div style={{ display: "flex" }}>FIRST</div>
        <div style={{ display: "flex", color: GOLD }}>HUNDRED.</div>
      </div>
      <div style={{ display: "flex", marginTop: 32, width: 440, fontSize: 30, lineHeight: 1.45, color: MUTED }}>
        Founding Collector No. {no} on ComixCatalog. Lifetime membership, numbered badge, name on the wall.
      </div>

      {/* the pass */}
      <div
        style={{
          position: "absolute",
          right: -28,
          top: 236,
          width: 500,
          height: 700,
          display: "flex",
          padding: 14,
          borderRadius: 30,
          backgroundImage: FOIL,
          transform: "rotate(8deg)",
        }}
      >
        <div style={{ display: "flex", flex: 1, position: "relative", overflow: "hidden", borderRadius: 18, backgroundColor: "#05081a" }}>
          {covers.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: -56,
                top: -64,
                width: 584,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                transform: "rotate(-8deg)",
              }}
            >
              {covers.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" width={188} height={282} style={{ width: 188, height: 282, objectFit: "cover" }} />
              ))}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              backgroundImage: "linear-gradient(180deg, rgba(5,8,26,0.15) 0%, rgba(5,8,26,0.1) 24%, rgba(5,8,26,0.8) 50%, rgba(5,8,26,0.96) 66%, #05081a 100%)",
            }}
          />
          <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", padding: "24px 28px 30px" }}>
            <div style={{ display: "flex", alignSelf: "flex-start", padding: "8px 16px", borderRadius: 999, backgroundColor: "rgba(5,8,26,0.85)", fontSize: 20, fontWeight: 800, letterSpacing: 4 }}>
              COMIXCATALOG
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: "auto" }}>
              <div style={{ display: "flex", fontFamily: "Display", fontSize: 32, fontWeight: 800, color: GOLD, paddingBottom: 34, marginRight: 10 }}>NO.</div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Display",
                  fontSize: 216,
                  fontWeight: 800,
                  lineHeight: 0.82,
                  backgroundImage: FOIL_TEXT,
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {no}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 16, fontFamily: "Display", fontSize: 58, fontWeight: 800, lineHeight: 0.92 }}>
              <div style={{ display: "flex" }}>FOUNDING</div>
              <div style={{ display: "flex" }}>COLLECTOR</div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.2) 42%, rgba(255,255,255,0) 54%)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: "auto",
          paddingTop: 32,
          borderTop: "2px solid rgba(244,208,63,0.35)",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>@{username}</div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: GOLD }}>comixcatalog.com/founding-collectors</div>
      </div>
    </div>
  );
}

// The cover area is 952 x 780 at 1080 x 1350. Covers grow to fill it, so a
// 3-book list gets three big covers instead of one small row.
const LIST_AREA = { width: 952, height: 780 };
const LIST_GAP = 14;
const COVER_RATIO = 0.66;

export function listCoverSize(count) {
  const n = Math.max(1, Math.min(9, count));
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellWidth = (LIST_AREA.width - LIST_GAP * (cols - 1)) / cols;
  const cellHeight = (LIST_AREA.height - LIST_GAP * (rows - 1)) / rows;
  const width = Math.floor(Math.min(cellWidth, cellHeight * COVER_RATIO));
  return { width, height: Math.floor(width / COVER_RATIO) };
}

function ListCard({ title, username, count, covers }) {
  const size = listCoverSize(covers.length);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 64,
        color: INK,
        fontFamily: "Inter",
        background: `linear-gradient(145deg, ${NAVY_DEEP}, ${NAVY})`,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 6,
          color: GOLD,
        }}
      >
        COMIXCATALOG LIST
      </div>
      <div
        style={{
          display: "flex",
          maxHeight: 220,
          marginTop: 28,
          overflow: "hidden",
          fontFamily: "Display",
          fontSize: titleSize(title),
          fontWeight: 800,
          lineHeight: 0.9,
        }}
      >
        {title}
      </div>
      <div
        style={{ display: "flex", marginTop: 18, color: MUTED, fontSize: 28 }}
      >
        A list by @{username} · {count} books
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignContent: "center",
          gap: LIST_GAP,
          height: LIST_AREA.height,
          marginTop: 38,
          overflow: "hidden",
        }}
      >
        {covers.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={index}
            src={src}
            alt=""
            width={size.width}
            height={size.height}
            style={{
              width: size.width,
              height: size.height,
              objectFit: "cover",
              borderRadius: 8,
              boxShadow: "0 18px 40px rgba(0,0,0,.45)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: 24,
          fontSize: 28,
          fontWeight: 800,
          borderTop: "2px solid rgba(244,208,63,.35)",
        }}
      >
        <span>@{username}</span>
        <span style={{ color: GOLD }}>comixcatalog.com</span>
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
  founding: {
    load: loadFoundingCard,
    render: (data) => <FoundingCard {...data} />,
    isEmpty: (data) => !data.isFounder,
    emptyMessage: "Only Founding Collectors have a pass to share.",
    size: FOUNDING_SIZE,
    filename: "comixcatalog-founding-collector.png",
  },
  list: {
    load: loadListCard,
    render: (data) => <ListCard {...data} />,
    isEmpty: (data) => !data.found,
    emptyMessage: "List not found.",
    size: LIST_SIZE,
    filename: "comixcatalog-list.png",
  },
};
