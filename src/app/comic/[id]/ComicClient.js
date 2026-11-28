"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import GradeEditor from "@/components/GradeEditor";
import CatalogLinkPicker from "@/components/CatalogLinkPicker";
import { authedFetch } from "@/lib/apiClient";
import { isUnlinkedForSale } from "@/lib/listingCompleteness";
import { issueNumberSuffix } from "@/lib/issueNumberLabel";
import { formatGcdDate } from "@/lib/issueDetails";

const CREDIT_ROLE_ORDER = new Map([
  ["writer", 0],
  ["artist", 1],
  ["penciler", 2],
  ["inker", 3],
  ["colorist", 4],
  ["letterer", 5],
  ["cover", 6],
  ["editor", 7],
]);

function creditRole(value) {
  const role = String(value ?? "").trim().toLocaleLowerCase();
  const aliases = {
    script: "writer",
    pencils: "penciler",
    penciller: "penciler",
    inks: "inker",
    colors: "colorist",
    colourist: "colorist",
    letters: "letterer",
    "cover artist": "cover",
  };
  return aliases[role] ?? role;
}

function roleLabel(value) {
  return value ? `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}` : "Credit";
}

function groupedCredits(credits) {
  const groups = new Map();
  for (const credit of credits ?? []) {
    for (const rawRole of credit.roles ?? []) {
      const role = creditRole(rawRole);
      if (!role) continue;
      const names = groups.get(role) ?? [];
      if (credit.name && !names.some((name) => name.toLocaleLowerCase() === credit.name.toLocaleLowerCase())) names.push(credit.name);
      groups.set(role, names);
    }
  }
  return [...groups.entries()]
    .map(([role, names]) => ({ role, label: roleLabel(role), names }))
    .sort((a, b) => (CREDIT_ROLE_ORDER.get(a.role) ?? 100) - (CREDIT_ROLE_ORDER.get(b.role) ?? 100) || a.label.localeCompare(b.label));
}

export default function ComicClient() {
  const { id } = useParams();
  const { collections, collectionIds, wishlistIds, addToCollection, removeFromCollection } =
    useLibrary();
  const { user } = useAuth();
  const router = useRouter();

  const [comic, setComic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gradeData, setGradeData] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [showAllCharacters, setShowAllCharacters] = useState(false);

  async function remove(scope) {
    const result = await removeFromCollection(String(id), { scope });
    setMutationError(result?.ok === false ? result.error || "Library update failed" : null);
  }

  const inCollection = collectionIds?.has(String(id));
  const inWishlist = wishlistIds?.has(String(id));

  // Find the user_collections row for this comic so GradeEditor has an ID
  const matchingCollectionRows = collections?.filter(
    (c) => c.comic_id != null && String(c.comic_id) === String(id)
  ) ?? [];
  const collectionRow = matchingCollectionRows.find((c) => c.status === "for_sale")
    ?? matchingCollectionRows[0]
    ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadComic() {
      setLoading(true);
      setNotFound(false);
      setShowAllCharacters(false);

      try {
        const res = await fetch(`/api/comics/${id}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        const issue = data?.issue;
        if (!issue) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!cancelled) {
          setComic({
            id: issue.id,
            title: issue.series_title,
            issueNumber: issue.issue_number,
            year: issue.release_year,
            publisher: issue.publisher ?? null,
            created_by: issue.created_by ?? null,
            source: issue.source ?? "user",
            cover: issue.cover ?? null,
            details: issue.details ?? null,
          });
        }
      } catch (err) {
        console.error("Comic detail load failed:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadComic();
    return () => { cancelled = true; };
  }, [id]);

  function handleShare() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  }

  async function handleCatalogLink(gcdIssueId) {
    try {
      const res = await authedFetch("/api/library/catalog-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: [{ collection_id: collectionRow.id, gcd_issue_id: gcdIssueId }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.linked !== 1) {
        throw new Error(data.errors?.[0]?.message || data.error || "Link failed");
      }
      router.push(`/issue/gcd-${gcdIssueId}`);
    } catch (error) {
      alert(error.message || "Link failed. Please try again.");
    }
  }

  if (loading) {
    return (
      <main className="page-wrapper">
        <div className="detail-layout">
          <div className="issue-cover-frame skeleton" style={{ aspectRatio: "2/3", borderRadius: 12 }} />
          <div className="metadata-column">
            <div className="skeleton" style={{ height: 36, width: "70%", borderRadius: 8, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 20, width: "40%", borderRadius: 8, marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !comic) {
    return (
      <main className="page-wrapper" style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>Comic not found</h1>
        <button className="add-comic-btn" onClick={() => router.push("/search")}>
          Back to Search
        </button>
      </main>
    );
  }

  const issueTitle = `${comic.title || "Untitled"}${issueNumberSuffix(comic.issueNumber)}`;
  const details = comic.details;
  const dateRows = details ? [
    { label: "Cover date", value: formatGcdDate(details.cover_date) },
    { label: "On sale", value: formatGcdDate(details.store_date) },
  ].filter((row) => row.value) : [];
  const creditGroups = groupedCredits(details?.credits);
  const characters = details?.characters ?? [];
  const shownCharacters = showAllCharacters ? characters : characters.slice(0, 20);

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Issue</div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
          <div className="muted" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <button className="link" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => router.back()}>
              ← Back
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span className="pill">User Added</span>
            {inCollection && <span className="pill pill-collection">In Collection</span>}
            {inWishlist && <span className="pill pill-wishlist">On Wishlist</span>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: "28px", alignItems: "start", marginBottom: "28px" }}>
          {/* Cover column */}
          <div>
            <div className="issue-cover-frame">
              {comic.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={comic.cover} alt={issueTitle} className="issue-cover-img" />
              ) : (
                <div className="issue-cover-img" style={{ background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>
                  No Cover
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "18px" }}>
              {!user && (
                <>
                  <Link
                    href={`/signup?next=${encodeURIComponent(`/comic/${id}`)}`}
                    className="add-comic-btn"
                    style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
                  >
                    Save to your library
                  </Link>
                  <Link
                    href={`/signup?next=${encodeURIComponent(`/comic/${id}`)}`}
                    className="add-comic-btn"
                    style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
                  >
                    Add to wantlist
                  </Link>
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                    Free to start. Sign up in 30 seconds.
                  </div>
                </>
              )}
              {user && !inCollection && !inWishlist && (
                <>
                  <button className="add-comic-btn" onClick={() => addToCollection(String(id), "owned")}>
                    Add to Collection
                  </button>
                  <button className="add-comic-btn" onClick={() => addToCollection(String(id), "wishlist")}>
                    Add to Wishlist
                  </button>
                </>
              )}
              {user && inCollection && (
                <button className="add-comic-btn" onClick={() => remove("latest-copy")}>
                  Remove from Collection
                </button>
              )}
              {user && inWishlist && (
                <button className="add-comic-btn" onClick={() => remove("wishlist")}>
                  Remove from Wishlist
                </button>
              )}
              {mutationError && <div style={{ color: "#ff8a80", fontSize: "0.85rem" }}>{mutationError}</div>}
              {user && comic.source === "user" && user.id === comic.created_by && (
                <button className="add-comic-btn" onClick={() => router.push(`/comic/${comic.id}/edit`)}>
                  Edit Comic
                </button>
              )}
              <button className="add-comic-btn" onClick={handleShare}>
                Copy Link
              </button>
            </div>
          </div>

          {/* Metadata column */}
          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>{issueTitle}</h1>
            {details?.issue_name && <p className="issue-main-story-title">{details.issue_name}</p>}
            <p className="muted" style={{ marginBottom: "18px" }}>
              {comic.publisher || "Unknown Publisher"}
              {comic.year ? ` · ${comic.year}` : ""}
            </p>

            {isUnlinkedForSale(collectionRow) && (
              <div className="library-unlinked-notice" style={{ marginBottom: "22px" }}>
                <span>Not in the marketplace yet. Link this book to the catalog to list it.</span>
                <button type="button" className="library-row-btn" onClick={() => setCatalogPickerOpen(true)}>Link to catalog</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px", marginBottom: "22px" }}>
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Issue Info</h3>
                <p><strong>Series:</strong> {comic.title || "-"}</p>
                <p><strong>Issue:</strong> {comic.issueNumber || "-"}</p>
                <p><strong>Publisher:</strong> {comic.publisher || "Unknown"}</p>
                <p><strong>Year:</strong> {comic.year || "-"}</p>
              </div>
            </div>

            {dateRows.length > 0 && (
              <div className="metadata-section">
                <h3 className="issue-section-title">Details</h3>
                <dl className="issue-detail-list">
                  {dateRows.map((row) => (
                    <div key={row.label} className="issue-detail-row">
                      <dt className="muted">{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Grade editor - only shown when this comic is in the user's collection */}
            {user && inCollection && collectionRow?.id && (
              <div className="metadata-section" style={{ margin: 0, marginBottom: "22px" }}>
                <h3 className="issue-section-title">Condition & Grade</h3>
                <GradeEditor
                  collectionId={collectionRow.id}
                  releaseYear={comic?.year ?? null}
                  initialData={{
                    grade_numeric: gradeData?.grade_numeric ?? collectionRow.grade_numeric ?? null,
                    condition: gradeData?.condition ?? collectionRow.condition ?? null,
                    slab_company: gradeData?.slab_company ?? collectionRow.slab_company ?? null,
                    slab_cert_number: gradeData?.slab_cert_number ?? collectionRow.slab_cert_number ?? null,
                    notes: gradeData?.notes ?? collectionRow.notes ?? null,
                  }}
                  onSave={(updated) => setGradeData((prev) => ({ ...prev, ...updated }))}
                />
              </div>
            )}
          </div>
        </div>

        {details && (creditGroups.length > 0 || characters.length > 0 || details.story_arcs?.length > 0) && (
          <div className={`issue-below-grid${creditGroups.length ? "" : " is-side-only"}${characters.length || details.story_arcs?.length ? "" : " is-main-only"}`}>
            <div>
              {creditGroups.length > 0 && (
                <div className="metadata-section">
                  <h2 className="issue-section-title">Credits</h2>
                  <div className="issue-story-credits">
                    {creditGroups.map((group) => (
                      <div key={group.role}>
                        <span>{group.label}</span>
                        <span>{group.names.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="issue-below-side">
              {characters.length > 0 && (
                <section>
                  <div className="issue-section-heading"><h2>Characters</h2></div>
                  <div className="issue-character-list">{shownCharacters.map((name) => <span key={name}>{name}</span>)}</div>
                  {characters.length > 20 && (
                    <button type="button" className="link issue-character-toggle" onClick={() => setShowAllCharacters((value) => !value)}>
                      {showAllCharacters ? "Show fewer" : `Show all ${characters.length}`}
                    </button>
                  )}
                </section>
              )}
              {details.story_arcs?.length > 0 && (
                <section>
                  <div className="issue-section-heading"><h2>Story arcs</h2></div>
                  <div className="issue-character-list">{details.story_arcs.map((name) => <span key={name}>{name}</span>)}</div>
                </section>
              )}
            </div>
          </div>
        )}

        {details?.source_url && (
          <footer className="issue-data-footer">
            <p>Details from <a href={details.source_url} target="_blank" rel="noreferrer">ComicVine</a></p>
          </footer>
        )}
      </section>
      {catalogPickerOpen && collectionRow && (
        <CatalogLinkPicker
          entry={{ collection_id: collectionRow.id, comic: { series_title: comic.title, issue_number: comic.issueNumber, release_year: comic.year } }}
          onApply={handleCatalogLink}
          onClose={() => setCatalogPickerOpen(false)}
        />
      )}
    </main>
  );
}
