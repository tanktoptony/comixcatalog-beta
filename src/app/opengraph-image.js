/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { getServiceClient } from "@/lib/supabase/service";
import { loadClassicCovers } from "@/lib/heroWall";
import { ogCover } from "@/lib/og/cover";
import { ogFonts } from "@/lib/og/fonts";
import { formatCountDown } from "@/lib/og/helpers";
import { StatTile } from "@/lib/og/components";
import { theme } from "@/lib/og/theme";
import { OG_SIZE } from "@/lib/og/card";
export const alt = "ComixCatalog: Catalog. Collect. Connect.";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;
async function counts() {
  const db = getServiceClient();
  const r = await Promise.all([
    db.from("gcd_issues").select("gcd_id", { count: "estimated", head: true }),
    db.from("creators").select("id", { count: "estimated", head: true }),
    db.from("key_issues").select("gcd_issue_id", { count: "exact", head: true }),
  ]);
  return r.some((x) => x.error) ? null : r.map((x) => x.count);
}
export async function homeImage() {
  let covers = [],
    live = null;
  try {
    [covers, live] = await Promise.all([loadClassicCovers(), counts()]);
  } catch (e) {
    console.warn("home OG data failed:", e);
  }
  const loaded = (await Promise.all(covers.slice(0, 12).map((c) => ogCover(c.cover)))).filter(Boolean),
    wall = loaded.length >= 8;
  return new ImageResponse(
    (
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
        <div
          style={{
            position: "absolute",
            right: -80,
            top: -100,
            width: 820,
            height: 820,
            background: "radial-gradient(circle,rgba(216,176,75,.20),transparent 65%)",
          }}
        />
        {wall && (
          <div
            style={{
              position: "absolute",
              right: -90,
              top: -80,
              width: 680,
              height: 810,
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              transform: "rotate(-8deg)",
            }}
          >
            {loaded.map((src, i) => (
              <img
                alt=""
                key={i}
                src={src}
                width="150"
                height="225"
                style={{
                  width: 150,
                  height: 225,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,.75)",
                  borderRadius: 6,
                }}
              />
            ))}
          </div>
        )}
        {wall && (
          <div
            style={{
              position: "absolute",
              left: 450,
              top: 0,
              width: 330,
              height: "100%",
              background: `linear-gradient(90deg,${theme.bg},transparent)`,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: wall ? 640 : "100%",
            alignItems: wall ? "flex-start" : "center",
            padding: wall ? "52px 0 52px 62px" : "52px 120px",
          }}
        >
          <div
            style={{
              color: theme.gold,
              fontFamily: "Big Shoulders",
              fontWeight: 800,
              letterSpacing: 2,
              fontSize: 42,
            }}
          >
            COMIXCATALOG
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Big Shoulders",
              fontWeight: 800,
              fontSize: wall ? 72 : 88,
              lineHeight: 0.9,
              textTransform: "uppercase",
              marginTop: 16,
            }}
          >
            <span>Catalog.</span>
            <span>Collect.</span>
            <span>Connect.</span>
          </div>
          <div
            style={{
              color: theme.muted,
              fontWeight: 600,
              fontSize: wall ? 21 : 26,
              lineHeight: 1.25,
              marginTop: 21,
              maxWidth: 560,
            }}
          >
            The comic book database and collection tracker, built by collectors.
          </div>
          {live && (
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              {["issues", "creators", "key issues"].map((label, i) => (
                <StatTile key={label} value={formatCountDown(live[i])} label={label} />
              ))}
            </div>
          )}
          <div style={{ color: theme.muted, fontSize: 20, fontWeight: 600, marginTop: 24 }}>comixcatalog.com</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
export default homeImage;
