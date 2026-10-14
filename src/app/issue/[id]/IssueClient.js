"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import AdSlot from "@/components/AdSlot";
import { SLOT } from "@/lib/houseAds";
import { getSupabaseClient } from "@/lib/supabase/client";
import GradeEditor from "@/components/GradeEditor";
import { countCopies } from "@/lib/libraryMutations";
import { buildIssueDetailsRows, formatGcdDate, formatGcdPrice, humanizeStoryType, parseGcdCreditList, stripGcdCharacterNoise } from "@/lib/issueDetails";
import { conditionLabel, contactLabel, formatValue, offerHref } from "@/lib/marketplaceFormat";

function money(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

// GCD lists characters as "Wolverine [Logan; James Howlett]; Lucy Mellace":
// split on semicolons outside brackets only, and show aliases in parentheses.
function splitCharacters(text) {
  const out = [];
  let depth = 0;
  let current = "";
  // Brackets nest for teams ("Fantastic Four [Human Torch [Johnny Storm]; ...]"),
  // so convert character by character: [ -> (, ] -> ), inner ; -> ,
  for (const ch of String(text ?? "")) {
    if (ch === "[") {
      depth += 1;
      current += "(";
    } else if (ch === "]") {
      depth = Math.max(0, depth - 1);
      current += ")";
    } else if ((ch === ";" || ch === "\n") && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch === ";" ? "," : ch;
    }
  }
  out.push(current);
  return out.map((name) => name.replace(/\s*\(\s*/g, " (").replace(/\s*,\s*/g, ", ").replace(/\s*\)/g, ")"));
}

function storyCharacters(value) {
  const all = (Array.isArray(value) ? value : splitCharacters(value))
    .map((name) => String(name).trim()).filter(Boolean);
  return { shown: all.slice(0, 12), remaining: Math.max(0, all.length - 12) };
}

function StoryCredits({ story, creators }) {
  const roles = [["script", "Script"], ["pencils", "Pencils"], ["inks", "Inks"], ["colors", "Colors"], ["letters", "Letters"]];
  const rows = roles.filter(([field]) => String(story?.[field] ?? "").trim());
  if (!rows.length) return null;
  return <div className="issue-story-credits">{rows.map(([field, label]) => <div key={field}><span>{label}</span><span>{parseGcdCreditList(story[field]).map(({ name, note }, index) => {
    const creator = creators?.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return <span key={`${field}-${name}`} title={note || undefined}>{index ? ", " : ""}{creator ? <Link href={`/creator/${creator.slug}`}>{name}</Link> : name}{note && <sup className="issue-credit-note">*</sup>}</span>;
  })}</span></div>)}</div>;
}

function EditingCredits({ value, creators }) {
  return <span className="issue-editing-list">{parseGcdCreditList(value).map(({ name, note }) => {
    const creator = creators?.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return <span key={name} title={note || undefined}>{creator ? <Link href={`/creator/${creator.slug}`}>{name}</Link> : name}<small>Editor{note ? ` · ${note}` : ""}</small></span>;
  })}</span>;
}

function ExpandableSynopsis({ children }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = String(children ?? "").length > 320;
  if (!isLong) return <p style={{ margin: 0 }}>{children}</p>;
  return (
    <div>
      <p style={expanded ? { margin: 0 } : { margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{children}</p>
      <button type="button" className="link" onClick={() => setExpanded((value) => !value)} style={{ background: "none", border: 0, padding: "6px 0 0", cursor: "pointer" }}>
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

function ReprintList({ title, items }) {
  const [showAll, setShowAll] = useState(false);
  if (!items?.length) return null;
  const shown = showAll ? items : items.slice(0, 7);
  return (
    <div>
      <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px" }}>{title}</h3>
      <ol style={{ margin: 0, paddingLeft: "22px", display: "grid", gap: "6px" }}>
        {shown.map((item) => (
          <li key={`${item.gcd_issue_id}-${item.notes ?? ""}`}>
            <Link href={item.href}>{item.series_title || "Untitled"}{item.issue_number != null ? ` #${item.issue_number}` : ""}{item.year ? ` (${item.year})` : ""}</Link>
            {item.notes && <span className="muted"> · {item.notes}</span>}
          </li>
        ))}
      </ol>
      {items.length > 7 && (
        <button type="button" className="link" onClick={() => setShowAll((value) => !value)} style={{ background: "none", border: 0, padding: "8px 0 0", cursor: "pointer" }}>
          {showAll ? "Show fewer" : `See all ${items.length}`}
        </button>
      )}
    </div>
  );
}

export default function IssueClient({ initialIssue = null }) {
  const { id } = useParams();
  const { collections, collectionIds, wishlistIds, addToCollection, addAnotherCopy, removeFromCollection } =
    useLibrary();

  const [issue, setIssue] = useState(initialIssue);
  const [loading, setLoading] = useState(!initialIssue);
  // Inline modal for "+ Add another copy". window.prompt() doesn't work
  // under Next.js Turbopack - explicit React state instead.
  const [addCopyOpen, setAddCopyOpen] = useState(false);
  const [addCopyLabel, setAddCopyLabel] = useState("");
  const [addCopyBusy, setAddCopyBusy] = useState(false);
  const [selectedCover, setSelectedCover] = useState(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantSaveState, setVariantSaveState] = useState(null);
  const [gradeData, setGradeData] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [showAds, setShowAds] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const libraryId = String(issue?.id || id || "");

  const inCollection = collectionIds?.has(libraryId);
  const inWishlist = wishlistIds?.has(libraryId);

  useEffect(() => {
    if (!id) return;

    if (initialIssue) {
      return;
    }

    async function loadIssue() {
      setLoading(true);

      try {
        // authedFetch sends the caller's session so the API can compute
        // per-arc ownership counts for the "Part of [Arc Name] - you own
        // X of Y" badge - server derives identity from the verified token,
        // not a query param.
        const res = await authedFetch(`/api/issues/${id}`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data?.issue) {
          setIssue(null);
          return;
        }

        setIssue(data.issue);
        setSelectedCover(data.issue.cover || null);
      } catch (err) {
        console.error("Issue page load failed:", err);
        setIssue(null);
      } finally {
        setLoading(false);
      }
    }

    loadIssue();
  }, [id, user?.id, initialIssue]);

  // Funnel: one view event per loaded issue. Keyed on issue.id, not the
  // load effect above, which re-runs when auth resolves.
  useEffect(() => {
    if (!issue?.id || authLoading) return;
    trackEvent("issue_view", {
      issue_id: issue.id,
      series_id: issue.series_id,
      series_title: issue.series_title,
      issue_number: issue.issue_number,
      logged_in: Boolean(user),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id, authLoading]);

  const issueTitle = useMemo(() => {
    if (!issue) return "";
    return `${issue.series_title}${issue.issue_number ? ` #${issue.issue_number}` : ""}`;
  }, [issue]);
  const detailRows = useMemo(() => buildIssueDetailsRows(issue), [issue]);
  const allCharacters = useMemo(() => {
    const characters = (issue?.stories ?? []).flatMap((story) => storyCharacters(story.characters).shown).map(stripGcdCharacterNoise);
    return [...new Map(characters.map((character) => [character.name, character])).values()];
  }, [issue]);
  const orderedStories = useMemo(() => {
    const stories = [...(issue?.stories ?? [])];
    const mainIndex = stories.findIndex((story) => String(story.type ?? "").toLocaleLowerCase() === "comic story");
    if (mainIndex > 0) stories.unshift(...stories.splice(mainIndex, 1));
    return stories;
  }, [issue]);
  const mainStoryTitle = orderedStories.find((story) => String(story.type ?? "").toLocaleLowerCase() !== "cover")?.title;

  const issueRows = collections?.filter(
    (row) => issue?.source === "gcd" && Number(row.gcd_issue_id) === Number(String(issue.id || "").replace(/^gcd-/, ""))
  ) ?? [];
  const collectionRow = issueRows.find((row) => row.status === "owned")
    ?? issueRows.find((row) => row.status === "for_sale")
    ?? null;
  const copyCount = countCopies(issueRows);

  async function runMutation(mutation) {
    setMutationError(null);
    const result = await mutation();
    if (result?.ok === false) setMutationError(result.error || "Library update failed");
  }

  // The collector's own copy: a photo they uploaded or the printing they
  // picked (both live in user_cover_url). When there is one, the page leads
  // with it, and the strip below flips to the catalog cover and variants.
  const ownCover = inCollection ? gradeData?.user_cover_url ?? collectionRow?.user_cover_url ?? null : null;
  const shownCover = selectedCover || ownCover || issue?.cover || null;
  const coverChoices = [
    ...(ownCover ? [{ key: "own", url: ownCover, label: "Your copy" }] : []),
    ...(issue?.cover && issue.cover !== ownCover ? [{ key: "main", url: issue.cover, label: "Catalog" }] : []),
    ...(issue?.variants ?? [])
      .filter((v) => v.storageUrl && v.storageUrl !== ownCover)
      .map((v, i) => ({ key: v.id, url: v.storageUrl, label: `Variant ${i + 1}` })),
  ];

  async function saveOwnedVariant() {
    if (!collectionRow?.id || issue?.source !== "gcd") return;
    setVariantSaveState("saving");
    try {
      // `variant_of_gcd_id` is a forward-hook for a future GCD-native
      // variant-issue link (see migration 0010) - it points to a *different*
      // base gcd_issue, which this page never has. Writing this issue's own
      // id into it (the old behavior) was a no-op self-reference that also
      // ignored which cover thumbnail the collector actually clicked. The
      // thing the user is picking here is which `cover_variants` image is
      // their printing, so persist that into `user_cover_url` - the field
      // already used sitewide as "the image representing this specific
      // copy" (library, public profile, PDF export). Only write it when a
      // thumbnail was actually selected, so confirming just a label doesn't
      // clobber a personal photo the collector uploaded elsewhere.
      const payload = { variant_label: variantLabel.trim() || null };
      if (selectedCover) payload.user_cover_url = selectedCover;
      const { error } = await getSupabaseClient()
        .from("user_collections")
        .update(payload)
        .eq("id", collectionRow.id);
      if (error) throw error;
      setVariantSaveState("saved");
    } catch (error) {
      console.error("Variant selection save failed:", error);
      setVariantSaveState("error");
    }
  }

  if (loading) {
    return (
      <main className="page-wrapper">
        <section className="comic-panel">
          <p>Loading…</p>
        </section>
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="page-wrapper">
        <section className="comic-panel">
          <p>Issue not found.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <nav className="issue-breadcrumb" aria-label="Issue navigation">
          <div><Link href="/search">{issue.publisher || "Publisher"}</Link><span>/</span>{issue.series_id ? <Link href={`/series/${issue.series_id}`}>{issue.series_title}{issue.release_year ? ` (${issue.release_year})` : ""}</Link> : <span>{issue.series_title}</span>}<span>/</span><strong>#{issue.issue_number}</strong></div>
          <div className="issue-prev-next">
              {issue.prev_issue ? (
                <Link href={`/issue/${issue.prev_issue.id}`} aria-label={`Previous issue, number ${issue.prev_issue.issue_number}`}>← #{issue.prev_issue.issue_number}</Link>
              ) : <span>←</span>}
              {issue.next_issue ? (
                <Link href={`/issue/${issue.next_issue.id}`} aria-label={`Next issue, number ${issue.next_issue.issue_number}`}>#{issue.next_issue.issue_number} →</Link>
              ) : <span>→</span>}
          </div>
        </nav>

        {/* ── Story-arc membership badges ──────────────────────────────
            For each arc this issue belongs to, show name + ownership
            progress + click-through to the arc completion page. Most
            issues will be in zero arcs; a few notable books are in
            multiple (e.g. cross-event tie-ins). */}
        {issue.arcs && issue.arcs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {issue.arcs.map((arc) => (
              <Link
                key={arc.id}
                href={arc.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.06)",
                  border: "1px solid rgba(255,215,0,0.25)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {arc.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={arc.image_url}
                    alt=""
                    style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.7,
                    }}
                  >
                    Part of Story Arc
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginTop: 2 }}>
                    {arc.name}
                  </div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: 2 }}>
                    {user
                      ? `You own ${arc.owned} of ${arc.total}${arc.owned === arc.total && arc.total > 0 ? " - complete!" : ""}`
                      : `${arc.total} issue${arc.total === 1 ? "" : "s"} - sign in to track completion`}
                  </div>
                </div>
                <div style={{ color: "var(--cc-gold, #FFD700)", fontWeight: 700, fontSize: "1.2rem" }}>→</div>
              </Link>
            ))}
          </div>
        )}

        <div className="issue-detail-hero">
          <div className="issue-hero-cover">
            <div className="issue-cover-frame">
              <img
                src={shownCover || "/fallback-cover.png"}
                alt={`${issueTitle}${issue.release_year ? ` (${issue.release_year})` : ""} cover`}
                className="issue-cover-img"
              />
              {ownCover && shownCover === ownCover && <span className="issue-cover-badge">Your copy</span>}
            </div>

            {coverChoices.length > 1 && (
              <div className="issue-cover-choices" style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
                  {issue.variants?.length > 0 ? "Covers" : "Your copy and the catalog cover"}
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {coverChoices.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedCover(c.url)}
                      aria-label={c.label}
                      aria-pressed={shownCover === c.url}
                      className={`issue-cover-pick${shownCover === c.url ? " is-on" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url || "/fallback-cover.png"} alt="" />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
                {user && inCollection && collectionRow?.id && issue.variants?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <input value={variantLabel} onChange={(event) => setVariantLabel(event.target.value)} placeholder="Printing label (optional)" maxLength={80} className="admin-input" style={{ flex: "1 1 180px" }} />
                    <button type="button" className="add-comic-btn" onClick={saveOwnedVariant} disabled={variantSaveState === "saving"}>
                      {variantSaveState === "saved" ? "Saved" : "This is the printing I own"}
                    </button>
                  </div>
                )}
                {variantSaveState === "error" && <div className="muted" style={{ color: "#fca5a5", marginTop: 6 }}>Could not save this printing.</div>}
              </div>
            )}

            <div className="issue-collection-actions"
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              {!user && (
                <>
                  <Link
                    href={`/signup?next=${encodeURIComponent(`/issue/${id}`)}`}
                    className="add-comic-btn"
                    style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
                  >
                    Add to collection
                  </Link>
                  <Link
                    href={`/signup?next=${encodeURIComponent(`/issue/${id}`)}`}
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
                  <button
                    className="add-comic-btn"
                    onClick={() => runMutation(() => addToCollection(libraryId, "owned"))}
                  >
                    Add to collection
                  </button>

                  <button
                    className="add-comic-btn"
                    onClick={() => runMutation(() => addToCollection(libraryId, "wishlist"))}
                  >
                    Add to wantlist
                  </button>
                </>
              )}

              {user && inCollection && (
                <>
                  <button
                    className="add-comic-btn"
                    onClick={() => {
                      setAddCopyLabel("");
                      setAddCopyOpen(true);
                    }}
                    title="Track another copy of this issue (different variant, or just another physical copy)"
                  >
                    + Add another copy
                  </button>
                  <button
                    className="add-comic-btn"
                    onClick={() => runMutation(() => removeFromCollection(libraryId, { scope: "latest-copy" }))}
                  >
                    {copyCount > 1 ? `Remove 1 copy (${copyCount} owned)` : "Remove from Collection"}
                  </button>
                </>
              )}

              {user && inWishlist && (
                <button
                  className="add-comic-btn"
                  onClick={() => runMutation(() => removeFromCollection(libraryId, { scope: "wishlist" }))}
                >
                  Remove from Wishlist
                </button>
              )}
              {mutationError && (
                <div style={{ color: "#ff8a80", fontSize: "0.85rem" }}>{mutationError}</div>
              )}
            </div>
          </div>

          <div className="issue-hero-info">
            <p className="issue-hero-eyebrow">Issue{issue.edition_name ? ` · ${issue.edition_name}` : ""}{issue.release_year ? ` · ${issue.release_year < 1986 ? "Bronze Age" : issue.release_year < 1992 ? "Copper Age" : issue.release_year < 2000 ? "Modern Age" : "Contemporary"}` : ""}</p>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>
              {issueTitle}{issue.release_year ? ` (${issue.release_year})` : ""}
            </h1>

            {(mainStoryTitle || issue.title) && <p className="issue-main-story-title">{mainStoryTitle || issue.title}</p>}

            {issue.key_issue?.reason && (
              <p className="issue-key-chip">
                <span aria-hidden="true">★</span> {issue.key_issue.reason}
              </p>
            )}

            {issue.edition_name && issue.edition_gcd_issue_id !== issue.base_gcd_issue_id && (
              <p className="issue-edition-note">Selected edition: {issue.edition_name}{!issue.edition_has_own_cover ? ". Showing the base edition cover." : ""}</p>
            )}

            <div className="issue-fact-chips">
              <span>{issue.publisher || "Unknown Publisher"}</span>
              {/* display_date is the API's canonical English "Month YYYY"
                  rendering, derived from key_date. Replaces the redundant
                  release_year + raw publication_date pair that used to leak
                  foreign-language month names (e.g. "septembre 2008"). */}
              {issue.display_date && <span>{issue.display_date}</span>}
              {issue.details?.page_count && <span>{issue.details.page_count} pages</span>}
              {issue.versions?.length > 1 && <span>{issue.versions.length} versions</span>}
            </div>

            {issue.market?.estimate != null && (
              <div className="issue-value-card">
                <span className="issue-kicker">Estimated from current asking prices</span>
                <strong>{money(issue.market.estimate)}</strong>
                {issue.market.sample_size > 0 && <small>{issue.market.sample_size} listing{issue.market.sample_size === 1 ? "" : "s"} sampled</small>}
              </div>
            )}
            {issue.source === "gcd" && (
              <div className="issue-market-actions">
                {issue.listings?.length > 0 && <a href="#forsale" className="add-comic-btn">Buy a copy</a>}
                <Link href="/library?tab=collection" className="add-comic-btn">Sell a copy</Link>
              </div>
            )}

            <div className="issue-rail-collection">
              {!user && <><Link href={`/signup?next=${encodeURIComponent(`/issue/${id}`)}`} className="add-comic-btn issue-primary-cta">Add to collection</Link><Link href={`/signup?next=${encodeURIComponent(`/issue/${id}`)}`} className="add-comic-btn">Add to wantlist</Link></>}
              {user && !inCollection && !inWishlist && <><button className="add-comic-btn issue-primary-cta" onClick={() => runMutation(() => addToCollection(libraryId, "owned"))}>Add to collection</button><button className="add-comic-btn" onClick={() => runMutation(() => addToCollection(libraryId, "wishlist"))}>Add to wantlist</button></>}
              {user && inCollection && <><span className="pill pill-collection">{copyCount > 1 ? `${copyCount} copies owned` : "In collection"}</span><button className="add-comic-btn" onClick={() => { setAddCopyLabel(""); setAddCopyOpen(true); }}>+ Add another copy</button><button className="add-comic-btn" onClick={() => runMutation(() => removeFromCollection(libraryId, { scope: "latest-copy" }))}>{copyCount > 1 ? "Remove 1 copy" : "Remove from collection"}</button></>}
              {user && inWishlist && <><span className="pill pill-wishlist">On wantlist</span><button className="add-comic-btn" onClick={() => runMutation(() => removeFromCollection(libraryId, { scope: "wishlist" }))}>Remove from wantlist</button></>}
              {mutationError && <div className="issue-action-error">{mutationError}</div>}
            </div>

            {(issue.market?.median != null || issue.market?.low != null || issue.market?.high != null) && (
            <div
              style={{
                display: "grid",
                // Listings/Median/Low-High stat cards - collapse to fewer
                // columns on narrow phones rather than squeezing.
                gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
                gap: "12px",
                marginBottom: "22px",
              }}
            >
              <div className="metadata-section" style={{ margin: 0 }}>
                <div className="issue-section-title">Median</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                  {money(issue.market?.median)}
                </div>
              </div>

              <div className="metadata-section" style={{ margin: 0 }}>
                <div className="issue-section-title">Low / High</div>
                <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {money(issue.market?.low)} / {money(issue.market?.high)}
                </div>
              </div>
            </div>
            )}

            <div
              style={{
                display: "grid",
                // Details + Quick Actions - stack under ~520px.
                gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
                gap: "18px",
                marginBottom: "22px",
              }}
            >
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Details</h3>
                <dl style={{ margin: 0 }}>
                  {detailRows.map((row) => (
                    <div key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(92px, 34%) 1fr", gap: "12px", padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <dt className="muted" style={{ margin: 0 }}>{row.label}</dt>
                      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{row.label === "Editing" ? <EditingCredits value={row.value} creators={issue.credits} /> : row.href ? <Link href={row.href}>{row.value}</Link> : row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Quick Actions</h3>

                <div style={{ display: "grid", gap: "10px" }}>
                  <button
                    className="add-comic-btn"
                    onClick={() => {
                      if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
                    }}
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            </div>

            {issue.stories?.length > 0 && (
              <div className="metadata-section" style={{ margin: "0 0 22px" }}>
                <h2 className="issue-section-title">Contents</h2>
                <div style={{ display: "grid" }}>
                  {orderedStories.map((story, index) => {
                    const isCover = String(story.type ?? "").trim().toLowerCase() === "cover";
                    return (
                      <article key={`${story.sequence_number ?? index}-${story.title ?? story.feature ?? "story"}`} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: "10px", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.09)" }}>
                        <div className="muted" style={{ fontVariantNumeric: "tabular-nums", paddingTop: "2px" }}>{story.sequence_number ?? index + 1}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                            {(story.title || story.feature) && <span className="pill" style={{ fontSize: "0.67rem", padding: "2px 7px" }}>{humanizeStoryType(story.type)}</span>}
                            <h3 style={{ fontSize: "1rem", margin: 0, flex: "1 1 160px" }}>{story.title || story.feature || humanizeStoryType(story.type)}</h3>
                            {story.page_count != null && story.page_count !== "" && <span className="muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{story.page_count} pp</span>}
                          </div>
                          <StoryCredits story={story} creators={issue.credits} />
                          {!isCover && story.synopsis && <ExpandableSynopsis>{story.synopsis}</ExpandableSynopsis>}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {issue.ad_pages_count > 0 && <button type="button" className="issue-ads-toggle" onClick={() => setShowAds((value) => !value)}>{showAds ? "Hide ads and promo pages" : `+ ${issue.ad_pages_count} ads and promo pages`}</button>}
                {showAds && <p className="muted issue-ads-note">Advertising and promotional pages are indexed but omitted from the reading-order list.</p>}
              </div>
            )}

            {issue.source === "gcd" && !issue.credits?.length && !issue.stories?.length && <div className="metadata-section"><h2 className="issue-section-title">Contents</h2><p className="muted">Credits not indexed yet.</p></div>}

            {issue.details?.notes && (
              <div className="metadata-section" style={{ margin: "0 0 22px" }}>
                <h2 className="issue-section-title">Notes</h2>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{issue.details.notes}</p>
              </div>
            )}

            {(issue.reprints?.reprintedFrom?.length > 0 || issue.reprints?.reprintedIn?.length > 0) && (
              <div className="metadata-section" style={{ margin: "0 0 22px" }}>
                <h2 className="issue-section-title">Reprints</h2>
                <div style={{ display: "grid", gap: "16px" }}>
                  <ReprintList title="Reprints material from" items={issue.reprints?.reprintedFrom} />
                  <ReprintList title="Reprinted in" items={issue.reprints?.reprintedIn} />
                </div>
              </div>
            )}

            {issue.source === "gcd" && detailRows.length > 0 && (
              <p className="muted" style={{ fontSize: "0.75rem", margin: "-10px 0 22px" }}>
                Issue details from the{" "}
                <a href={`https://www.comics.org/issue/${String(issue.id).replace(/^gcd-/, "")}/`} target="_blank" rel="noreferrer">Grand Comics Database (CC BY-SA 4.0)</a>
              </p>
            )}

            {/* Condition & Grade - including "your photo of this book," which
                is otherwise easy to never discover (previously only lived on
                /library and /comic/[id], never on the page where users
                actually add canonical issues to their collection). */}
            {user && inCollection && collectionRow?.id && (
              <div className="metadata-section" style={{ margin: 0, marginBottom: "22px" }}>
                <h3 className="issue-section-title">Condition & Grade</h3>
                <GradeEditor
                  collectionId={collectionRow.id}
                  canonicalCover={selectedCover || issue.cover || null}
                  releaseYear={issue?.release_year ?? null}
                  initialData={{
                    grade_numeric: gradeData?.grade_numeric ?? collectionRow.grade_numeric ?? null,
                    condition: gradeData?.condition ?? collectionRow.condition ?? null,
                    slab_company: gradeData?.slab_company ?? collectionRow.slab_company ?? null,
                    slab_cert_number: gradeData?.slab_cert_number ?? collectionRow.slab_cert_number ?? null,
                    notes: gradeData?.notes ?? collectionRow.notes ?? null,
                    user_cover_url: gradeData?.user_cover_url ?? collectionRow.user_cover_url ?? null,
                  }}
                  onSave={(updated) => setGradeData((prev) => ({ ...prev, ...updated }))}
                />
              </div>
            )}

            {issue.related_issues?.length > 0 && (
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Nearby Issues</h3>

                <div
                  style={{
                    display: "grid",
                    // Nearby Issues thumbnails - 4-up on desktop, 2-up on
                    // mobile (covers stay legible at ~140px min).
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
                    gap: "12px",
                    marginTop: "12px",
                  }}
                >
                  {issue.related_issues.map((related) => (
                    <Link
                      key={related.id}
                      href={`/issue/${related.id}`}
                      className="comic-card"
                      style={{ textDecoration: "none" }}
                    >
                      <div className="comic-card-title">
                        {issue.series_title} #{related.issue_number}
                      </div>

                      {related.title && (
                        <div className="comic-card-meta" style={{ marginBottom: 4 }}>
                          {related.title}
                        </div>
                      )}

                      <div className="comic-card-meta">
                        {related.release_year || "Unknown Year"}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {issue.versions?.length > 1 && (
          <section className="issue-discogs-section issue-versions-section">
            <div className="issue-section-heading"><h2>Versions</h2><span>Base edition and known variants</span></div>
            <div className="issue-table-box"><table className="issue-discogs-table"><thead><tr><th>Version</th><th>On sale</th><th>Price</th><th>Barcode / ID</th></tr></thead><tbody>
              {issue.versions.map((version) => <tr key={version.gcdId} className={version.gcdId === issue.edition_gcd_issue_id ? "is-selected" : ""}>
                <td><Link href={`/issue/gcd-${issue.base_gcd_issue_id}?edition=${version.gcdId}`}>{version.name}</Link></td>
                <td>{formatGcdDate(version.onSaleDate) || "Not indexed"}</td><td>{formatGcdPrice(version.price) || "Not indexed"}</td>
                <td className="issue-mono">{version.barcode || `GCD ${version.gcdId}`}</td>
              </tr>)}
            </tbody></table></div>
          </section>
        )}

        {allCharacters.length > 0 && <section className="issue-discogs-section"><div className="issue-section-heading"><h2>Characters</h2></div><div className="issue-character-list">{allCharacters.map(({ name, note }) => <span key={name}>{name}{note && <small>{note}</small>}</span>)}</div></section>}

        {issue.source === "gcd" && (
          <section id="forsale" className="issue-discogs-section">
            <div className="issue-section-heading"><h2>For sale</h2>{issue.listings?.length > 0 && <span>{issue.listings.length} available</span>}</div>
            {!issue.listings?.length ? <div className="issue-empty-card">No copies for sale yet{user && inCollection && <> · <Link href="/library?tab=collection">Sell yours</Link></>}</div> : <div className="issue-table-box"><table className="issue-discogs-table"><thead><tr><th>Grade</th><th>Edition</th><th>Seller</th><th>Price</th><th></th></tr></thead><tbody>
              {issue.listings.map((listing) => <tr key={listing.id}><td>{conditionLabel(listing)}</td><td>{listing.variant || "Base edition"}</td><td><Link href={`/u/${encodeURIComponent(listing.seller)}`}>@{listing.seller}</Link><small>Listed {new Date(listing.listedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</small></td><td>{listing.price != null ? formatValue(listing.price) : "Open to offers"}</td><td><Link className="issue-row-button" href={offerHref(listing)}>{contactLabel(listing)}</Link></td></tr>)}
            </tbody></table></div>}
          </section>
        )}

        {issue.source === "gcd" && <footer className="issue-data-footer"><div><span>Indexed</span><span>{issue.credits?.length ? "Credits indexed" : "Credits not indexed yet"}</span><span>{issue.details?.barcode ? "Barcode indexed" : "Barcode not indexed"}</span></div><p>Data from the <a href={`https://www.comics.org/issue/${issue.edition_gcd_issue_id || String(issue.id).replace(/^gcd-/, "")}/`} target="_blank" rel="noreferrer">Grand Comics Database</a> (CC BY-SA 4.0)</p></footer>}
      </section>

      <AdSlot position={SLOT.ISSUE_INLINE_1} pageKey={String(id)} className="ad-slot--issue" />

      {/* + Add another copy modal. window.prompt() doesn't work in
          Next.js Turbopack so we use a React-managed dialog. */}
      {addCopyOpen && (
        <div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-copy-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !addCopyBusy) setAddCopyOpen(false);
          }}
        >
          <div className="onboarding-card" style={{ maxWidth: 420, textAlign: "left" }}>
            <button
              type="button"
              className="onboarding-close"
              onClick={() => !addCopyBusy && setAddCopyOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 id="add-copy-title" className="onboarding-title" style={{ textAlign: "left" }}>
              Add another copy
            </h2>
            <p className="onboarding-body" style={{ textAlign: "left" }}>
              Track an additional copy of this issue. Optionally label the
              variant - Newsstand, Cover B, 1:25 Incentive, etc. Leave blank
              if it&rsquo;s the same printing as your existing copy.
            </p>
            <input
              type="text"
              className="admin-input"
              placeholder="Variant label (optional)"
              value={addCopyLabel}
              onChange={(e) => setAddCopyLabel(e.target.value)}
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!addCopyBusy) {
                    (async () => {
                      setAddCopyBusy(true);
                      await addAnotherCopy(libraryId, { variant_label: addCopyLabel.trim() || null });
                      setAddCopyBusy(false);
                      setAddCopyOpen(false);
                    })();
                  }
                }
                if (e.key === "Escape" && !addCopyBusy) setAddCopyOpen(false);
              }}
              style={{ marginBottom: 14 }}
            />
            <div className="onboarding-actions">
              <button
                type="button"
                className="onboarding-cta"
                disabled={addCopyBusy}
                onClick={async () => {
                  setAddCopyBusy(true);
                  await addAnotherCopy(libraryId, { variant_label: addCopyLabel.trim() || null });
                  setAddCopyBusy(false);
                  setAddCopyOpen(false);
                }}
              >
                {addCopyBusy ? "Adding…" : "Add copy"}
              </button>
              <button
                type="button"
                className="onboarding-secondary"
                disabled={addCopyBusy}
                onClick={() => setAddCopyOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
