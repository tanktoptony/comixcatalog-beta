"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { coverThumb } from "@/lib/coverThumb";

export default function KeyIssueRows({ groups, rulings }) {
  const { user } = useAuth();
  const { collectionIds, wishlistIds } = useLibrary();

  return groups.map((group) => (
    <section className="key-era" key={group.id}>
      <h2>{group.label}</h2>
      <ol className="key-era-list">
        {group.issues.map((issue) => {
          const issueId = `gcd-${issue.gcd_issue_id}`;
          const ruling = rulings[issue.gcd_issue_id];
          return (
            <li key={issue.gcd_issue_id}>
              <Link className="key-era-row" href={`/issue/${issueId}`}>
                {issue.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverThumb(issue.cover)} alt="" loading="lazy" />
                ) : (
                  <span className="key-era-cover-missing">No cover</span>
                )}
                <span className="key-era-copy">
                  <span className="key-era-heading">
                    <strong>#{issue.issue_number}</strong>
                    <time>{issue.year ?? "Year unknown"}</time>
                    {Number(issue.tier) === 1 && <em>Major</em>}
                    {user && collectionIds?.has(issueId) && <span className="library-tag owned">Owned</span>}
                    {user && !collectionIds?.has(issueId) && wishlistIds?.has(issueId) && <span className="library-tag wanted">Wantlist</span>}
                  </span>
                  <span className="key-era-reason">{issue.reason}</span>
                  {ruling?.note && (
                    <span className={`key-era-ruling verdict-${ruling.verdict || "note"}`}>
                      <small>{ruling.verdict === "not_key" ? "Not a key, our ruling" : "Our ruling"}</small>
                      {ruling.note}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  ));
}
