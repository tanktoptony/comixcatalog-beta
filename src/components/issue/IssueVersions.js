"use client";

// The Versions table on an issue page. Big modern books have dozens of
// versions (Absolute Batman #1: 44), which used to run several screens down
// the page. It now sits in a fixed-height box with its own scrollbar and a
// header that stays put, opens scrolled to the selected version, and gets a
// filter once there are more than FILTER_FROM versions.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";
import { filterVersions, formatGcdDate, formatGcdPrice } from "@/lib/issueDetails";

const FILTER_FROM = 10;

export default function IssueVersions({ versions, baseGcdId, selectedGcdId, coverById }) {
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const shown = useMemo(() => filterVersions(versions, query), [versions, query]);

  // Bring the selected version into view inside the box only; the page
  // itself must not jump.
  useEffect(() => {
    const box = boxRef.current;
    const row = box?.querySelector("tr.is-selected");
    if (!box || !row) return;
    const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, offset - box.clientHeight / 2 + row.offsetHeight / 2);
  }, [selectedGcdId]);

  return (
    <section className="issue-discogs-section issue-versions-section">
      <div className="issue-section-heading"><h2>Versions</h2><span>Own a different version? Open it to switch your copy.</span></div>
      {versions.length > FILTER_FROM && (
        <div className="issue-versions-tools">
          <input
            type="search"
            className="issue-versions-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${versions.length} versions: artist, printing, foil…`}
            aria-label="Filter versions"
          />
          <span className="issue-versions-count" aria-live="polite">
            {query.trim() ? `${shown.length} of ${versions.length}` : `${versions.length} versions`}
          </span>
        </div>
      )}
      <div ref={boxRef} className="issue-table-box issue-versions-box">
        <table className="issue-discogs-table issue-versions-table">
          <thead><tr><th>Version</th><th>On sale</th><th>Price</th><th className="issue-versions-barcode">Barcode / ID</th></tr></thead>
          <tbody>
            {shown.map((version) => {
              const cover = coverById.get(version.gcdId);
              return (
                <tr key={version.gcdId} className={version.gcdId === selectedGcdId ? "is-selected" : ""}>
                  <td>
                    <Link className="issue-version-link" href={`/issue/gcd-${baseGcdId}?edition=${version.gcdId}`} scroll={false} aria-current={version.gcdId === selectedGcdId ? "page" : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <span className="issue-version-thumb">{cover && <img src={coverThumb(cover)} alt="" width={18} height={26} loading="lazy" />}</span>
                      <span>{version.name}</span>
                    </Link>
                  </td>
                  <td>{formatGcdDate(version.onSaleDate) || "Not indexed"}</td>
                  <td>{formatGcdPrice(version.price) || "Not indexed"}</td>
                  <td className="issue-mono issue-versions-barcode">{version.barcode || `GCD ${version.gcdId}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="issue-versions-empty">No version matches “{query.trim()}”.</p>}
      </div>
    </section>
  );
}
