"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { coverThumb } from "@/lib/coverThumb";
import { trackEvent } from "@/lib/analytics";

export default function ComicResultCard({ item, index = 0, query = "", coverCaption, onMutationError, onChosen, hideActions = false, actionContent = null }) {
  const { user } = useAuth();
  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } = useLibrary();
  const isSeries = item.__source === "series", isUserAdded = item.__source === "user";
  const inCollection = !isSeries && collectionIds.has(item.id), inWishlist = !isSeries && wishlistIds.has(item.id);
  const href = isSeries ? `/series/${item.seriesId}` : isUserAdded ? `/comic/${item.id}` : `/issue/${item.id}`;
  async function add(status) {
    const result = await addToCollection(item.id, status);
    if (result?.ok === false) onMutationError?.(result.error || "Library update failed");
    else onChosen?.(item);
  }
  async function remove(scope) {
    const result = await removeFromCollection(item.id, { scope });
    onMutationError?.(result?.ok === false ? result.error || "Library update failed" : null);
  }
  return <article className="comic-card">
    <Link prefetch={false} href={href} className="card-link" onClick={() => trackEvent("search_result_click", { result_type: isSeries ? "series" : isUserAdded ? "comic" : "issue", result_id: item.id, search_term: query, position: index })}>
      <div className="comic-card-cover"><img src={coverThumb(item.cover || "/fallback-cover.png")} alt={item.title || "Comic cover"} loading="lazy" onError={(e) => { e.currentTarget.src = "/fallback-cover.png"; }} />{coverCaption && <span className="pill" style={{ position: "absolute", zIndex: 2, left: 8, bottom: 8 }}>{coverCaption}</span>}</div>
      <div className="comic-card-title">{item.title || "Untitled"}{item.issueNumber ? ` #${item.issueNumber}` : ""}</div>
      <div className="comic-card-meta">{[item.publisher, item.year, isSeries && item.issueCount ? `${item.issueCount} issues` : null].filter(Boolean).join(" · ") || "Unknown"}</div>
      {isUserAdded && <span className="pill pill-new">User Added</span>}
    </Link>
    {!isSeries && <div className="comic-card-pills">{inCollection && <span className="pill pill-collection">In Collection</span>}{inWishlist && <span className="pill pill-wishlist">On Wishlist</span>}</div>}
    {!isSeries && !hideActions && <div className="comic-card-actions">
      {!inCollection && !inWishlist && (user ? <><button className="comic-btn" onClick={() => add("owned")}>+ Collection</button><button className="comic-btn" onClick={() => add("wishlist")}>+ Wantlist</button></> : <Link href={`/signup?next=${encodeURIComponent("/search")}`} className="comic-btn" style={{ textDecoration: "none", textAlign: "center" }}>+ Save</Link>)}
      {inCollection && <button className="comic-btn comic-btn-danger" onClick={() => remove("latest-copy")}>Remove</button>}
      {inWishlist && <button className="comic-btn comic-btn-danger" onClick={() => remove("wishlist")}>Remove</button>}
    </div>}
    {actionContent}
  </article>;
}
