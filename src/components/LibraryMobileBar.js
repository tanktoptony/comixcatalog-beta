"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShareCardButton from "@/components/ShareCardButton";

const SORT_OPTIONS = [
  ["title-asc", "Title A–Z"], ["title-desc", "Title Z–A"],
  ["year-desc", "Year newest"], ["year-asc", "Year oldest"],
  ["issue-asc", "Issue low–high"], ["issue-desc", "Issue high–low"],
];

// Gold stroke icons for the More sheet, drawn to match the approved mockup.
const ACTION_ICON_PATHS = {
  share: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  story: <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 17h4" /></>,
  sell: <><path d="M3 12l9-9h8v8l-9 9z" /><circle cx="15.5" cy="8.5" r="1.5" /></>,
  importCsv: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  exportCsv: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  pdf: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};
function ActionIcon({ name }) {
  return <svg className="library-mobile-action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ACTION_ICON_PATHS[name]}</svg>;
}

function Sheet({ open, onClose, labelledBy, children }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="library-mobile-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className="library-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <div className="library-mobile-sheet-handle" aria-hidden="true" />
        <button type="button" className="library-mobile-sheet-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

export default function LibraryMobileBar(props) {
  const {
    isPublicPreview, tab, setTab, counts, stats, valueOpen, setValueOpen,
    search, setSearch, publisherFilter, setPublisherFilter, availablePublishers,
    sortBy, setSortBy, filteredCount, viewMode, updateViewMode, handleShare,
    shareCopied, ownerId, username, handleCsvImport, selectedFile, setSelectedFile,
    handleExportCsv, handleExportPdf, csvExporting, pdfExporting,
    handleCatalogAudit, catalogAuditing, setAllForSale, bulkSaleBusy,
  } = props;
  const [sheet, setSheet] = useState(null);
  const openerRef = useRef(null);
  const sortLabel = SORT_OPTIONS.find(([value]) => value === sortBy)?.[1] ?? "Sort";
  const filterBits = [];
  if (publisherFilter !== "all") filterBits.push(publisherFilter);
  if (search.trim()) filterBits.push(`'${search.trim()}'`);
  const openSheet = (name, event) => { openerRef.current = event.currentTarget; setSheet(name); };
  const closeSheet = () => { setSheet(null); window.setTimeout(() => openerRef.current?.focus(), 0); };
  const run = (action) => { closeSheet(); action(); };
  const nextView = viewMode === "rows" ? "list" : viewMode === "list" ? "grid" : "rows";

  return (
    <section className="library-mobile-bar">
      <div className="library-mobile-title-row">
        <h1>My Library</h1>
        {!isPublicPreview && <Link href="/scan" className="library-mobile-scan">Scan</Link>}
        {!isPublicPreview && <button type="button" className="library-mobile-icon-btn" onClick={(event) => openSheet("more", event)} aria-label="More actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>}
      </div>
      <div className="library-mobile-tabs" role="tablist" aria-label="Library sections">
        <button type="button" role="tab" aria-selected={tab === "owned"} className={tab === "owned" ? "active" : ""} onClick={() => setTab("owned")}>Collection {counts.owned}</button>
        <button type="button" role="tab" aria-selected={tab === "wishlist"} className={tab === "wishlist" ? "active" : ""} onClick={() => setTab("wishlist")}>Wantlist {counts.wantlist}</button>
        {(counts.forSale > 0 || tab === "for_sale") && <button type="button" role="tab" aria-selected={tab === "for_sale"} className={tab === "for_sale" ? "active" : ""} onClick={() => setTab("for_sale")}>For sale {counts.forSale}</button>}
      </div>
      {!isPublicPreview && <button type="button" className="library-mobile-stat-line" onClick={() => setValueOpen((open) => !open)} aria-expanded={valueOpen}>{stats.owned} owned · ${Math.round(stats.value).toLocaleString("en-US")} · {stats.uniqueSeries} series<svg viewBox="0 0 24 24" aria-hidden="true"><path d={valueOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></svg></button>}
      <div className="library-mobile-toolbar">
        <button type="button" className="library-mobile-filter-btn" onClick={(event) => openSheet("filters", event)}>{filterBits.length ? filterBits.join(" · ") : `Search & filter ${filteredCount} books`}</button>
        <button type="button" className="library-mobile-sort-btn" onClick={(event) => openSheet("filters", event)}>{sortLabel}</button>
        <button type="button" className="library-mobile-icon-btn" onClick={() => updateViewMode(nextView)} aria-label={`Switch to ${nextView} view`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16" /></svg></button>
      </div>
      <Sheet open={sheet === "filters"} onClose={closeSheet} labelledBy="library-mobile-filter-title">
        <h2 id="library-mobile-filter-title">Search and filter</h2>
        <label className="library-mobile-field-label" htmlFor="library-mobile-search">Search</label>
        <input id="library-mobile-search" className="library-mobile-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, issue, publisher, or year" />
        <div className="library-mobile-field-label">Publisher</div>
        <div className="library-mobile-chips"><button type="button" className={publisherFilter === "all" ? "active" : ""} onClick={() => setPublisherFilter("all")}>All</button>{availablePublishers.map((publisher) => <button type="button" key={publisher.name} className={publisherFilter === publisher.name ? "active" : ""} onClick={() => setPublisherFilter(publisher.name)}>{publisher.name}</button>)}</div>
        <div className="library-mobile-field-label">Sort</div>
        <div className="library-mobile-chips">{SORT_OPTIONS.map(([value, label]) => <button type="button" key={value} className={sortBy === value ? "active" : ""} onClick={() => setSortBy(value)}>{label}</button>)}</div>
        <div className="library-mobile-sheet-footer"><button type="button" onClick={() => { setSearch(""); setPublisherFilter("all"); setSortBy("title-asc"); }}>Clear</button><button type="button" className="primary" onClick={closeSheet}>Show {filteredCount} books</button></div>
      </Sheet>
      {!isPublicPreview && <Sheet open={sheet === "more"} onClose={closeSheet} labelledBy="library-mobile-more-title">
        <h2 id="library-mobile-more-title">More actions</h2>
        <div className="library-mobile-action-label">Share</div>
        <button type="button" className="library-mobile-action" onClick={() => run(handleShare)}><ActionIcon name="share" />{shareCopied ? "Link copied" : "Share my collection"}</button>
        <ShareCardButton ownerId={ownerId} username={username} className="library-mobile-action" label={<><ActionIcon name="story" />Make a Story card</>} />
        {counts.owned > counts.forSale && <div className="library-mobile-action-label">Sell</div>}
        {counts.owned > counts.forSale && <button type="button" className="library-mobile-action" disabled={bulkSaleBusy} onClick={() => run(() => setAllForSale(true))}><ActionIcon name="sell" />{bulkSaleBusy ? "Listing..." : "List everything for sale"}</button>}
        <div className="library-mobile-action-label">Import and export</div>
        <form onSubmit={(event) => { handleCsvImport(event); closeSheet(); }} className="library-mobile-import"><label className="library-mobile-action"><ActionIcon name="importCsv" />{selectedFile ? selectedFile.name : "Import a CSV"}<input type="file" name="file" accept=".csv" hidden onChange={(event) => setSelectedFile(event.target.files[0] || null)} /></label>{selectedFile && <button type="submit" className="library-mobile-action"><ActionIcon name="importCsv" />Upload CSV</button>}</form>
        <button type="button" className="library-mobile-action" disabled={csvExporting} onClick={() => run(handleExportCsv)}><ActionIcon name="exportCsv" />{csvExporting ? "Exporting..." : "Export CSV"}</button>
        <button type="button" className="library-mobile-action" disabled={pdfExporting} onClick={() => run(handleExportPdf)}><ActionIcon name="pdf" />{pdfExporting ? "Generating..." : "Export PDF"}</button>
        <button type="button" className="library-mobile-action" disabled={catalogAuditing} onClick={() => run(handleCatalogAudit)}><ActionIcon name="link" />{catalogAuditing ? "Scanning..." : "Link books to the catalog"}</button>
      </Sheet>}
    </section>
  );
}
