"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";
import {
  KEY_TIMELINE_ERAS,
  groupByDecade,
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

// Phones: hover doesn't exist and a 70-year track is mostly sideways
// scrolling, so the timeline becomes one bar per decade (length = number of
// keys). Tapping a decade opens its keys with covers. CSS shows this only on
// narrow screens; desktop keeps the timeline.
function KeyDecades({ issues }) {
  const decades = useMemo(() => groupByDecade(issues), [issues]);
  const [open, setOpen] = useState(null);
  const most = Math.max(1, ...decades.map((decade) => decade.issues.length));
  return (
    <ol className="key-decades">
      {decades.map((decade) => {
        const isOpen = open === decade.decade;
        const majors = decade.issues.filter((issue) => Number(issue.tier) === 1).length;
        const panelId = `key-decade-${decade.decade}`;
        return (
          <li key={decade.decade} className={isOpen ? "is-open" : ""}>
            <button
              type="button"
              className="key-decade-row"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : decade.decade)}
            >
              <span className="key-decade-label">{decade.decade}s</span>
              <span className="key-decade-bar" aria-hidden="true">
                <span style={{ width: `${(decade.issues.length / most) * 100}%` }} />
              </span>
              <span className="key-decade-count">
                {decade.issues.length}
                {majors > 0 && <em>{majors} major</em>}
              </span>
            </button>
            {isOpen && (
              <ul id={panelId} className="key-decade-list">
                {decade.issues.map((issue) => (
                  <li key={issue.gcd_issue_id}>
                    <Link href={`/issue/gcd-${issue.gcd_issue_id}`}>
                      {issue.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coverThumb(issue.cover)} alt="" loading="lazy" />
                      ) : (
                        <span className="key-decade-nocover" />
                      )}
                      <strong className={Number(issue.tier) === 1 ? "is-major" : ""}>#{issue.issue_number}</strong>
                      <span>{issue.reason}</span>
                      <time>{issue.year}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function KeyTimeline({ issues = [] }) {
  const sortedIssues = useMemo(() => sortKeyIssues(issues), [issues]);
  const datedIssues = sortedIssues.filter((issue) => Number.isFinite(Number(issue.year)));
  const canShowTimeline = sortedIssues.length >= 4 && datedIssues.length === sortedIssues.length;
  const [view, setView] = useState(canShowTimeline ? "timeline" : "list");
  const [scrollState, setScrollState] = useState({ left: false, right: canShowTimeline });
  const [preview, setPreview] = useState(null);

  // A big cover pops up next to whichever key is hovered or focused. Placed
  // above the cover when there's room in the window, otherwise below it.
  function showPreview(issue, node) {
    const rect = node.getBoundingClientRect();
    const cardWidth = 196;
    const cardHeight = 330;
    const below = rect.top < cardHeight + 16;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - cardWidth / 2), window.innerWidth - cardWidth - 8);
    setPreview({ issue, left, top: below ? rect.bottom + 10 : rect.top - cardHeight - 10, below });
  }
  function hidePreview() {
    setPreview(null);
  }
  useEffect(() => {
    if (!preview) return undefined;
    window.addEventListener("scroll", hidePreview, { passive: true });
    return () => window.removeEventListener("scroll", hidePreview);
  }, [preview]);
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
            <div ref={scrollerRef} className="key-timeline-scroll" onScroll={() => { updateScrollFade(); hidePreview(); }}>
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
                        onMouseEnter={(event) => showPreview(issue, event.currentTarget)}
                        onMouseLeave={hidePreview}
                        onFocus={(event) => showPreview(issue, event.currentTarget)}
                        onBlur={hidePreview}
                      >
                        {issue.cover ? (
                          // The shared thumbnail helper provides the sized CDN asset.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coverThumb(issue.cover)} alt="" loading="lazy" />
                        ) : (
                          <span className="key-timeline-cover-missing">No cover</span>
                        )}
                        {Number(issue.tier) === 1 && <strong>#{issue.issue_number}</strong>}
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
          <KeyDecades issues={sortedIssues} />
          {preview && (
            // Fixed-position so it can't be clipped by the scrolling track.
            <div
              className={`key-timeline-preview${preview.below ? " is-below" : ""}`}
              style={{ left: preview.left, top: preview.top }}
              aria-hidden="true"
            >
              {preview.issue.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverThumb(preview.issue.cover)} alt="" />
              ) : (
                <span className="key-timeline-cover-missing">No cover yet</span>
              )}
              <span className="key-timeline-preview-num">#{preview.issue.issue_number}<time>{preview.issue.year}</time></span>
              <span className="key-timeline-preview-reason">{preview.issue.reason}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
