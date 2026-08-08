// Renders a branded 1080x1080 Instagram card (wordmark + headline/stat +
// subtext) server-side via satori (JSX -> SVG) + resvg (SVG -> PNG). Used
// for the "brand" post family in instagramBot.js — feature highlights,
// catalog stats, blog-post spotlights — as opposed to the cover-photo posts
// which just repost an existing canonical_covers image.
//
// Colors pulled directly from src/app/globals.css :root brand variables so
// this stays visually consistent with the site itself, not a separate
// palette someone has to remember to keep in sync.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, "../assets");

const COLORS = {
  navy: "#0b1e6b",
  gold: "#f4d03f",
  offwhite: "#fff9d6",
  bgPanel: "#1a1a1a",
  textMain: "#ffffff",
  redBurst: "#c4122f",
};

let fontsCache = null;
function loadFonts() {
  if (fontsCache) return fontsCache;
  fontsCache = [
    { name: "Inter", data: fs.readFileSync(path.join(ASSETS, "inter-400.woff")), weight: 400, style: "normal" },
    { name: "Inter", data: fs.readFileSync(path.join(ASSETS, "inter-700.woff")), weight: 700, style: "normal" },
    { name: "Inter", data: fs.readFileSync(path.join(ASSETS, "inter-900.woff")), weight: 900, style: "normal" },
  ];
  return fontsCache;
}

const SIZE = 1080;

// kicker: short label ("✦ By the numbers"). headline: the big line — a stat
// number or a short punchy title. subtext: one or two supporting sentences.
// accent: which brand color highlights the kicker/headline ("gold" | "red").
function cardTree({ kicker, headline, subtext, accent = "gold" }) {
  const accentColor = accent === "red" ? COLORS.redBurst : COLORS.gold;
  return {
    type: "div",
    props: {
      style: {
        width: SIZE,
        height: SIZE,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLORS.navy,
        padding: 72,
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: 16 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: accentColor,
                    display: "flex",
                  },
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    color: accentColor,
                    fontSize: 34,
                    fontWeight: 700,
                    letterSpacing: -0.5,
                    display: "flex",
                  },
                  children: kicker,
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 28 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    color: COLORS.textMain,
                    fontSize: headline.length > 40 ? 68 : 104,
                    fontWeight: 900,
                    lineHeight: 1.05,
                    letterSpacing: -1.5,
                    display: "flex",
                  },
                  children: headline,
                },
              },
              subtext
                ? {
                    type: "div",
                    props: {
                      style: {
                        color: COLORS.offwhite,
                        fontSize: 36,
                        fontWeight: 400,
                        lineHeight: 1.4,
                        display: "flex",
                        maxWidth: 850,
                      },
                      children: subtext,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", fontSize: 34, fontWeight: 900, letterSpacing: -0.5 },
                  children: [
                    { type: "span", props: { style: { color: COLORS.gold, display: "flex" }, children: "Comix" } },
                    { type: "span", props: { style: { color: COLORS.textMain, display: "flex" }, children: "Catalog" } },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: { color: COLORS.offwhite, fontSize: 28, fontWeight: 700, display: "flex" },
                  children: "comixcatalog.com",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

export async function renderBrandCard({ kicker, headline, subtext, accent }) {
  const svg = await satori(cardTree({ kicker, headline, subtext, accent }), {
    width: SIZE,
    height: SIZE,
    fonts: loadFonts(),
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } });
  const png = resvg.render();
  return png.asPng();
}
