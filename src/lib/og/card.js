/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { ogFonts } from "./fonts";
import { theme } from "./theme";
import { BrandBar, Slab, StatTile } from "./components";
import { fitTitle } from "./helpers";
import { ogCover } from "./cover";

export const OG_SIZE = { width: 1200, height: 630 };

function Glow({ left, top, size = 640 }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        background: "radial-gradient(circle,rgba(216,176,75,.18),transparent 68%)",
      }}
    />
  );
}

function Eyebrow({ children }) {
  return (
    <div
      style={{
        color: theme.gold,
        fontWeight: 600,
        fontSize: 21,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ children }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        color: theme.bg,
        background: theme.gold,
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: 0.8,
        padding: "6px 13px",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function Title({ text, max }) {
  return (
    <div
      style={{
        display: "flex",
        color: theme.text,
        fontFamily: "Big Shoulders",
        fontWeight: 800,
        fontSize: Math.min(max ?? 999, fitTitle(text)),
        lineHeight: 0.98,
        textTransform: "uppercase",
        maxHeight: 142,
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );
}

function Line({ children, size = 20, color = theme.muted, weight = 600, top = 10 }) {
  return (
    <div
      style={{
        display: "flex",
        color,
        fontSize: size,
        fontWeight: weight,
        marginTop: top,
        maxHeight: size * 2.6,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Stats({ stats }) {
  const shown = stats.filter((s) => Boolean(s.value)).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
      {shown.map((s) => (
        <StatTile key={s.label} value={s.value} label={s.label} />
      ))}
    </div>
  );
}

// Small labelled covers under the stats (a series' keys).
function Strip({ label, items }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
      <div style={{ color: theme.muted, fontSize: 13, fontWeight: 600, letterSpacing: 1.4, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <img
              alt=""
              src={item.src}
              width={56}
              height={84}
              style={{ width: 56, height: 84, objectFit: "cover", borderRadius: 4, border: `1px solid ${theme.line}` }}
            />
            {item.caption && (
              <div style={{ color: theme.goldSoft, fontSize: 13, fontWeight: 800, marginTop: 4 }}>{item.caption}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TextColumn({ eyebrow, pill, title, titleMax, issue, lines = [], stats = [], strip, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, ...style }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {pill && <Pill>{pill}</Pill>}
      <Title text={title} max={titleMax} />
      {issue && (
        <div style={{ color: theme.goldSoft, fontFamily: "Big Shoulders", fontWeight: 800, fontSize: 64, lineHeight: 1.02 }}>
          {issue}
        </div>
      )}
      {lines.filter(Boolean).map((line, i) => (
        <Line key={i} {...(typeof line === "string" ? { children: line } : line)} />
      ))}
      <Stats stats={stats} />
      {strip}
    </div>
  );
}

function frame(children) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: theme.bg,
        color: theme.text,
        fontFamily: "Inter",
      }}
    >
      {children}
    </div>
  );
}

// One cover in a slab on the left, the facts on the right (series, issue, listing).
export async function renderCoverCard({ cover, placeholder, strip, ...text }) {
  const [main, ...stripSrcs] = await Promise.all([
    ogCover(cover),
    ...(strip?.items ?? []).slice(0, 6).map((item) => ogCover(item.cover)),
  ]);
  const stripItems = (strip?.items ?? [])
    .slice(0, 6)
    .map((item, i) => ({ src: stripSrcs[i], caption: item.caption }))
    .filter((item) => item.src)
    .slice(0, 5);
  return new ImageResponse(
    frame([
      <Glow key="glow" left={20} top={-100} />,
      <div key="slab" style={{ display: "flex", width: 400, alignItems: "center", justifyContent: "center", paddingBottom: 60 }}>
        <Slab src={main} title={placeholder?.title ?? text.title} issue={placeholder?.issue ?? text.issue} width={286} height={429} />
      </div>,
      <TextColumn
        key="text"
        {...text}
        style={{ width: 800, padding: "40px 64px 100px 10px" }}
        strip={<Strip label={strip?.label} items={stripItems} />}
      />,
      <BrandBar key="brand" />,
    ]),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}

// Text on the left, a tilted wall of covers bleeding off the right edge
// (creator, profile, invite). Only covers that loaded are drawn; with none,
// the text column takes the full width.
export async function renderShelfCard({ covers = [], ...text }) {
  const loaded = (await Promise.all(covers.slice(0, 9).map(ogCover))).filter(Boolean).slice(0, 6);
  const wall = loaded.length > 0;
  const big = loaded.length <= 2;
  return new ImageResponse(
    frame([
      <Glow key="glow" left={600} top={-120} size={760} />,
      wall && (
          <div
            key="wall"
            style={{
              position: "absolute",
              left: big ? 700 : 640,
              top: big ? 60 : -40,
              width: big ? 560 : 620,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              transform: "rotate(-6deg)",
            }}
          >
            {loaded.map((src, i) => (
              <img
                alt=""
                key={i}
                src={src}
                width={big ? 230 : 180}
                height={big ? 345 : 270}
                style={{
                  width: big ? 230 : 180,
                  height: big ? 345 : 270,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,.8)",
                  borderRadius: 7,
                  boxShadow: "0 18px 36px rgba(0,0,0,.5)",
                }}
              />
            ))}
          </div>
      ),
      wall && (
          <div
            key="fade"
            style={{
              position: "absolute",
              left: 520,
              top: 0,
              width: 260,
              height: "100%",
              background: `linear-gradient(90deg,${theme.bg},transparent)`,
            }}
          />
      ),
      <TextColumn key="text" {...text} titleMax={text.titleMax ?? 84} style={{ width: wall ? 640 : 1200, padding: "40px 40px 100px 64px" }} />,
      <BrandBar key="brand" />,
    ]),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
