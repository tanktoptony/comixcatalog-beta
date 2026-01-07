"use client";

import Link from "next/link";
import { SERIES_FULL_NAMES } from "../data/seriesFullNames";

export default function MetadataGrid({
  item,
  inWishlist,
  inCollection,
  prevIssue,
  nextIssue,
}) {
  return (
    <div className="metadata-column space-y-8">
      <div className="w-full">
        <h1 className="text-3xl font-extrabold mb-2">
          {(SERIES_FULL_NAMES[item.series] || item.series) +
            " #" +
            item.issueNumber}
        </h1>
        <p className="text-slate-300 mb-6">
          {item.year || "Year TBD"} {item.creator && `· ${item.creator}`}
          {item.publisher && ` · ${item.publisher}`}
        </p>
        {/* ISSUE INFO */}
        <div className="mb-8">
          <div className="metadata-section">
            <h2 className="text-yellow-400 font-bold text-lg mb-3">
              Issue Info
            </h2>
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm leading-relaxed">
              <dt className="text-slate-400 font-medium">Series</dt>
              <dd>{item.series}</dd>
              <dt className="text-slate-400 font-medium">Issue</dt>
              <dd>#{item.issueNumber}</dd>
              <dt className="text-slate-400 font-medium">Title</dt>
              <dd>{item.title}</dd>
              <dt className="text-slate-400 font-medium">Publisher</dt>
              <dd>{item.publisher || "TBD"}</dd>
              <dt className="text-slate-400 font-medium">Creator</dt>
              <dd>{item.creator || "TBD"}</dd>
              <dt className="text-slate-400">Status</dt>
              <dd className="text-slate-200">
                {inCollection && "In Collection "}
                {inWishlist && (inCollection ? "· On Wishlist" : "On Wishlist")}
                {!inCollection && !inWishlist && "Not in your library yet"}
              </dd>
            </dl>
          </div>
        </div>
        {/* NAVIGATION */}
        <div className="detail-nav-row">
          {prevIssue ? (
            <Link href={`/comic/${prevIssue.id}`}>
              ← {prevIssue.series} #{prevIssue.issueNumber}
            </Link>
          ) : (
            <span className="text-slate-500 text-sm">No previous issue</span>
          )}

          {nextIssue ? (
            <Link href={`/comic/${nextIssue.id}`}>
              {nextIssue.series} #{nextIssue.issueNumber} →
            </Link>
          ) : (
            <span className="text-slate-500 text-sm">No next issue</span>
          )}
        </div>
      </div>
    </div>
  );
}
