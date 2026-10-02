"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { rangeSlice, valueChange, chartPoints, withLivePoint } from "@/lib/valueHistory";

// Collection value over time, from collection_value_history (one row per
// day, written every 6 hours by scripts/snapshotCollectionValue.js). Pro
// feature: free accounts see a short pitch instead of the chart. RLS lets a
// user read only their own rows, so this reads straight from the browser.

const RANGES = [
  ["30", "30D"],
  ["90", "90D"],
  ["all", "All"],
];
const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 8, left: 8 };

const money = (v) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function ValueHistoryChart({ userId, isPro, currentValue, initialRows = null }) {
  // initialRows: history already in hand (skips the fetch).
  const [rows, setRows] = useState(initialRows);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState("90");
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!isPro || !userId || initialRows) return;
    let cancelled = false;
    getSupabaseClient()
      .from("collection_value_history")
      .select("snapshot_date, total_value, owned_count")
      .eq("user_id", userId)
      .order("snapshot_date", { ascending: true })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("value history failed:", error);
          setFailed(true);
          return;
        }
        setRows(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [isPro, userId, initialRows]);

  // The line ends on today's live value (the same number as the header),
  // not on the last snapshot, which can be up to a day old.
  const series = useMemo(() => withLivePoint(rangeSlice(rows ?? [], range), currentValue), [rows, range, currentValue]);
  const change = useMemo(() => valueChange(series, currentValue), [series, currentValue]);
  const pts = useMemo(() => chartPoints(series, { W, H, PAD }), [series]);

  if (!isPro) {
    return (
      <section className="vh vh-pitch" aria-label="Collection value over time">
        <div>
          <h3>Your collection&rsquo;s value, over time</h3>
          <p>See how the market moves your books week to week, from real eBay comps. Part of Collector Pro.</p>
        </div>
        <Link href="/upgrade" className="vh-pitch-cta">
          See Collector Pro
        </Link>
      </section>
    );
  }

  if (failed) return null;

  const onMove = (e) => {
    if (!pts.length || !svgRef.current) return;
    const box = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
    setHover(best);
  };

  const h = hover != null ? pts[hover] : null;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = pts.length
    ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - PAD.bottom} L${pts[0].x.toFixed(1)},${H - PAD.bottom} Z`
    : "";
  const up = change && change.delta >= 0;

  return (
    <section className="vh" aria-label="Collection value over time">
      <div className="vh-head">
        <div>
          <div className="vh-label">Collection value</div>
          <div className="vh-value">{money(currentValue)}</div>
          {change && (
            <div className={`vh-change ${up ? "is-up" : "is-down"}`}>
              <span aria-hidden="true">{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
              {money(Math.abs(change.delta))}
              {change.pct != null && ` (${up ? "+" : "−"}${Math.abs(change.pct).toFixed(1)}%)`}
              <span className="vh-since"> since {day(change.from)}</span>
            </div>
          )}
        </div>
        <div className="vh-ranges" role="group" aria-label="Time range">
          {RANGES.map(([v, label]) => (
            <button key={v} type="button" className={range === v ? "is-on" : ""} aria-pressed={range === v} onClick={() => setRange(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="vh-empty">Loading your history…</div>
      ) : pts.length < 2 ? (
        <div className="vh-empty">Your value history starts building today. Check back in a few days.</div>
      ) : (
        <div className="vh-plot">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`Collection value from ${day(series[0].snapshot_date)} to ${day(series[series.length - 1].snapshot_date)}`}
          >
            <path d={area} className="vh-area" />
            <path d={line} className="vh-line" vectorEffect="non-scaling-stroke" />
            {h && <line x1={h.x} x2={h.x} y1={PAD.top} y2={H - PAD.bottom} className="vh-cross" vectorEffect="non-scaling-stroke" />}
          </svg>
          {h && (
            <>
              <span className="vh-dot" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / H) * 100}%` }} />
              <div className="vh-tip" style={{ left: `${Math.min(80, Math.max(20, (h.x / W) * 100))}%` }}>
                <b>{money(h.row.total_value)}</b>
                <span>{h.row.live ? "Today" : day(h.row.snapshot_date)} · {Number(h.row.owned_count).toLocaleString("en-US")} books</span>
              </div>
            </>
          )}
          <div className="vh-axis">
            <span>{day(series[0].snapshot_date)}</span>
            <span>{series[series.length - 1].live ? "Today" : day(series[series.length - 1].snapshot_date)}</span>
          </div>
          <table className="sr-only">
            <caption>Collection value by day</caption>
            <thead>
              <tr><th>Date</th><th>Value</th><th>Books</th></tr>
            </thead>
            <tbody>
              {series.map((r) => (
                <tr key={r.snapshot_date}><td>{r.snapshot_date}</td><td>{money(r.total_value)}</td><td>{r.owned_count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="vh-note">
        Estimated daily from recent eBay listings for each book&rsquo;s grade. It moves when the market does, even if your collection doesn&rsquo;t.
      </p>
    </section>
  );
}
