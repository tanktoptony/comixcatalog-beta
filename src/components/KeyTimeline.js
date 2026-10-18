"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";
import {
  KEY_TIMELINE_ERAS,
  keyCoverWidth,
  packTimelineRows,
  sortKeyIssues,
  xForYear,
} from "@/lib/keyTimeline";

const YEAR_PADDING = 2;
const TRACK_SIDE_PADDING = 54;
const PX_PER_YEAR = 15;
const ROW_GAP = 10;
const MAJOR_LABEL_HEIGHT = 22;
const AXIS_BOTTOM = 74;

// Covers are 2:3; a major key also carries its issue number under the cover.
function itemHeight(issue) {
  return Math.round(issue.width * 1.5) + (Number(issue.tier) === 1 ? MAJOR_LABEL_HEIGHT : 0);
}

function KeyIssueList({ issues, className = "" }) {
  return (
    <ol className={`key-timeline-list ${className}`.trim()}>
      {issues.map((issue) => (
        <li key={issue.gcd_issue_id}>
          <Link href={`/issue/gcd-${issue.gcd_issue_id}`}>
            <strong className={Number(issue.tier) === 1 ? "is-major" : ""}>#{issue.issue_number}</strong>
            <span>{issue.reason}</span>
            <time>{issue.year ?? "Year unknown"}</time>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function KeyTimeline({ issues = [] }) {
  const sortedIssues = useMemo(() => sortKeyIssues(issues), [issues]);
  const datedIssues = sortedIssues.filter((issue) => Number.isFinite(Number(issue.year)));
  const canShowTimeline = sortedIssues.length >= 4 && datedIssues.length === sortedIssues.length;
  const [view, setView] = useState(canShowTimeline ? "timeline" : "list");
  const [scrollState, setScrollState] = useState({ left: false, right: canShowTimeline });
  const scrollerRef = useRef(null);

  const layout = useMemo(() => {
    if (!canShowTimeline) return null;
    const years = sortedIssues.map((issue) => Number(issue.year));
    const startYear = Math.min(...years) - YEAR_PADDING;
    const endYear = Math.max(...years) + YEAR_PADDING;
    const width = Math.max(900, (endYear - startYear) * PX_PER_YEAR + TRACK_SIDE_PADDING * 2);
    const usableWidth = width - TRACK_SIDE_PADDING * 2;
    const positioned = sortedIssues.map((issue) => ({
      ...issue,
      width: keyCoverWidth(issue.tier),
      x: TRACK_SIDE_PADDING + xForYear(issue.year, startYear, endYear, usableWidth),
    }));
    const packed = packTimelineRows(positioned);
    const rowCount = Math.max(...packed.map((issue) => issue.row)) + 1;
    // Each row is as tall as its tallest cover, so rows of small keys stay tight.
    const rowHeights = Array.from({ length: rowCount }, (_, row) =>
      Math.max(...packed.filter((issue) => issue.row === row).map(itemHeight)) + ROW_GAP);
    const rowBottoms = rowHeights.map((_, row) =>
      AXIS_BOTTOM + 20 + rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0));
    const height = AXIS_BOTTOM + 20 + rowHeights.reduce((sum, h) => sum + h, 0) + 12;
    const eras = KEY_TIMELINE_ERAS.map((era) => {
      const eraStart = Math.max(startYear, era.start);
      const eraEnd = Math.min(endYear, era.end);
      if (eraStart > eraEnd) return null;
      const left = TRACK_SIDE_PADDING + xForYear(eraStart, startYear, endYear, usableWidth);
      const right = TRACK_SIDE_PADDING + xForYear(eraEnd, startYear, endYear, usableWidth);
      return { ...era, left, width: Math.max(1, right - left) };
    }).filter(Boolean);
    const decadeStart = Math.ceil(startYear / 10) * 10;
    const decades = [];
    for (let year = decadeStart; year <= endYear; year += 10) {
      decades.push({ year, x: TRACK_SIDE_PADDING + xForYear(year, startYear, endYear, usableWidth) });
    }
    return { startYear, endYear, width, height, packed, rowCount, rowBottoms, eras, decades };
  }, [canShowTimeline, sortedIssues]);

  function updateScrollFade() {
    const node = scrollerRef.current;
    if (!node) return;
    setScrollState({
      left: node.scrollLeft > 2,
      right: node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
    });
  }

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || view !== "timeline") return undefined;
    const frame = requestAnimationFrame(updateScrollFade);
    const observer = new ResizeObserver(updateScrollFade);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [layout, view]);

  const majorCount = sortedIssues.filter((issue) => Number(issue.tier) === 1).length;

  return (
    <section className="key-timeline-section">
      <div className="key-timeline-header">
        <div>
          <h2>Key issues</h2>
          <span>{majorCount} major · {sortedIssues.length} total</span>
        </div>
        {canShowTimeline && (
          <div className="key-timeline-toggle" aria-label="Key issue view">
            <button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          </div>
        )}
      </div>

      {view === "list" || !layout ? (
        <KeyIssueList issues={sortedIssues} />
      ) : (
        <>
          <div className={`key-timeline-frame${scrollState.left ? " has-left-overflow" : ""}${scrollState.right ? " has-right-overflow" : ""}`}>
            <div ref={scrollerRef} className="key-timeline-scroll" onScroll={updateScrollFade}>
              <div
                className="key-timeline-track"
                style={{ "--timeline-width": `${layout.width}px`, "--timeline-height": `${layout.height}px` }}
              >
                <div className="key-timeline-axis" />
                {layout.packed.map((issue) => {
                  const itemBottom = layout.rowBottoms[issue.row];
                  const tooltip = `#${issue.issue_number} · ${issue.year} · ${issue.reason}`;
                  return (
                    <div key={issue.gcd_issue_id} className="key-timeline-item-wrap" style={{ left: issue.x }}>
                      <span className="key-timeline-connector" style={{ height: itemBottom - AXIS_BOTTOM }} />
                      <Link
                        href={`/issue/gcd-${issue.gcd_issue_id}`}
                        className={`key-timeline-item tier-${Number(issue.tier) === 1 ? "1" : "2"}`}
                        style={{ bottom: itemBottom, width: issue.width }}
                        aria-label={tooltip}
                      >
                        {issue.cover ? (
                          // The shared thumbnail helper provides the sized CDN asset.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coverThumb(issue.cover)} alt="" loading="lazy" />
                        ) : (
                          <span className="key-timeline-cover-missing">No cover</span>
                        )}
                        {Number(issue.tier) === 1 && <strong>#{issue.issue_number}</strong>}
                        <span className="key-timeline-tooltip">{tooltip}</span>
                      </Link>
                      <span className="key-timeline-tick" />
                    </div>
                  );
                })}
                <div className="key-timeline-bands">
                  {layout.eras.map((era) => (
                    <div key={era.id} className={`key-timeline-band band-${era.id}`} style={{ left: era.left, width: era.width }}>
                      <span>{era.label}</span>
                    </div>
                  ))}
                </div>
                <div className="key-timeline-years">
                  {layout.decades.map(({ year, x }) => <span key={year} style={{ left: x }}>{year}</span>)}
                </div>
              </div>
            </div>
          </div>
          <KeyIssueList issues={sortedIssues} className="sr-only" />
        </>
      )}
    </section>
  );
}
