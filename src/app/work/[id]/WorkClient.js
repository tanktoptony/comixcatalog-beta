"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { coverThumb } from "@/lib/coverThumb";

const PANEL_TITLES = { TPB: "Trade paperbacks", HC: "Hardcovers" };

function yearRange(work) {
  if (work.year_start && work.year_end && work.year_start !== work.year_end) return `${work.year_start}–${work.year_end}`;
  return work.year_start || work.year_end || "Years unknown";
}

function editionNames(groups) {
  const names = ["single issues", ...groups.map((group) => (PANEL_TITLES[group.label] || group.label).toLowerCase())];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
}

function BookRow({ book, owned, wanted, user, onUpdate, next }) {
  return (
    <li className="work-book">
      <Link href={book.href} className="work-book-cover" aria-label={`View ${book.label}`}>
        {book.cover ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverThumb(book.cover)} alt="" width="72" height="108" loading="lazy" /> : <span className="work-cover-placeholder" aria-hidden="true" />}
      </Link>
      <div className="work-book-copy">
        <div className="work-book-label">{book.label}{owned && <span className="work-owned-pill">In your collection</span>}</div>
        {book.title && book.title !== book.label && <div className="work-book-title">{book.title}</div>}
        {book.year && <div className="work-book-year">{book.year}</div>}
        <div className="work-book-actions">
          {!owned && !wanted && (user ? <>
            <button type="button" className="work-btn work-btn--primary" onClick={() => onUpdate(book.id, "owned")}>+ Collection</button>
            <button type="button" className="work-btn" onClick={() => onUpdate(book.id, "wishlist")}>+ Wantlist</button>
          </> : <Link href={`/signup?next=${encodeURIComponent(next)}`} className="work-btn work-btn--primary">+ Add to collection</Link>)}
          {wanted && <span className="work-wanted-pill">On your wantlist</span>}
          {(owned || wanted) && <button type="button" className="work-btn work-btn--quiet" onClick={() => onUpdate(book.id, null)}>Remove</button>}
        </div>
      </div>
    </li>
  );
}

export default function WorkClient({ data }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { collectionIds, wishlistIds, addToCollection, removeFromCollection } = useLibrary();
  const [mutationError, setMutationError] = useState(null);
  const available = new Set(["single-issues", ...data.groups.map((group) => group.slug)]);
  const fallback = data.groups[0]?.slug || "single-issues";
  const requested = searchParams.get("tab");
  const selected = available.has(requested) ? requested : fallback;
  const group = data.groups.find((item) => item.slug === selected);
  const single = selected === "single-issues";
  const books = single ? data.single_issues : group?.books ?? [];
  const next = `${pathname}?tab=${selected}`;
  const allIds = new Set([...data.groups.flatMap((item) => item.books.map((book) => book.id)), ...data.single_issues.map((issue) => issue.id)]);
  const ownedCount = [...allIds].filter((id) => collectionIds?.has(String(id))).length;

  function selectTab(slug) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", slug);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  async function updateIssueLibrary(issueId, status) {
    try {
      const result = status
        ? await addToCollection(issueId, status)
        : await removeFromCollection(issueId, { scope: collectionIds?.has(String(issueId)) ? "latest-copy" : "wishlist" });
      setMutationError(result?.ok === false ? result.error || "Library update failed" : null);
    } catch (error) {
      console.error("Work issue library update failed:", error);
      setMutationError("Library update failed");
    }
  }

  return (
    <main className="page-wrapper">
      <section className="comic-panel series-public-page work-page">
        <nav className="series-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><Link href={`/series/${data.work.id}`}>{data.work.title}</Link><span aria-hidden="true">/</span><span>Editions</span>
        </nav>
        <div className="series-public-hero work-hero">
          <div className="series-cover-stack cover-count-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverThumb(data.work.cover || "/fallback-cover.png")} alt={`${data.work.title} cover`} className="series-cover-front" width="220" height="330" fetchPriority="high" />
          </div>
          <div className="series-hero-copy">
            <div className="series-eyebrow">{data.work.publisher || "Publisher unknown"} <span>·</span> {yearRange(data.work)} <span>·</span> All editions</div>
            <h1 className="series-public-title">{data.work.title}</h1>
            <p className="work-hero-blurb">Every edition in one place: {editionNames(data.groups)}. Pick a format to see each book and add the ones you own.</p>
            <dl className="work-stats">
              <div><dt>Books</dt><dd>{(data.work.issue_count + data.total_books).toLocaleString("en-US")}</dd></div>
              <div><dt>Editions</dt><dd>{data.groups.length + 1}</dd></div>
              {user && <div><dt>In your collection</dt><dd className="work-stats-owned">{ownedCount}</dd></div>}
            </dl>
          </div>
        </div>

        <div className="work-tabs" role="tablist" aria-label="Edition types">
          <button type="button" role="tab" aria-selected={single} onClick={() => selectTab("single-issues")}><span>Single issues</span><small>{data.work.issue_count}</small></button>
          {data.groups.map((item) => <button type="button" role="tab" aria-selected={selected === item.slug} onClick={() => selectTab(item.slug)} key={item.slug}><span>{item.label}</span><small>{item.books.length}</small></button>)}
        </div>

        <section className="work-panel" role="tabpanel">
          <div className="work-panel-heading">
            <h2>{single ? "Single issues" : PANEL_TITLES[group?.label] || group?.label}</h2>
            <p>{single ? data.work.issue_count : books.length} book{(single ? data.work.issue_count : books.length) === 1 ? "" : "s"}</p>
          </div>
          <ul className="work-book-list">
            {books.map((book) => <BookRow key={book.id} book={book} owned={collectionIds?.has(String(book.id))} wanted={wishlistIds?.has(String(book.id))} user={user} onUpdate={updateIssueLibrary} next={next} />)}
          </ul>
          {single && <Link className="work-all-issues" href={`/series/${data.work.id}`}>See all {data.work.issue_count} issues</Link>}
          {mutationError && <p className="series-mutation-error">{mutationError}</p>}
        </section>
      </section>
    </main>
  );
}
