"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";

export default function RunChecklist({ rows, seriesId }) {
  const { user } = useAuth();
  const { collectionIds } = useLibrary();

  return (
    <>
      {user && (
        <p className="checklist-member-note">
          Owned issues are checked from your library. <Link href={`/series/${seriesId}#issues`}>Mark what you own</Link>
        </p>
      )}
      <ol className="run-checklist">
        {rows.map((row) => (
          <li key={row.id} className={row.keyIssue ? "is-key" : ""}>
            <span className={`checklist-box${user && collectionIds?.has(row.id) ? " is-checked" : ""}`} aria-hidden="true">
              {user && collectionIds?.has(row.id) ? "✓" : ""}
            </span>
            <span className="checklist-copy">
              <span className="checklist-heading">
                <strong>#{row.issueNumber ?? "?"}</strong>
                <time>{row.year ?? "Year unknown"}</time>
              </span>
              {row.title && <span className="checklist-title">{row.title}</span>}
              {row.keyIssue && <span className="checklist-key">Key: {row.keyIssue.reason}</span>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
