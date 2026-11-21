"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import CommentThread from "@/components/comments/CommentThread";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { authedFetch } from "@/lib/apiClient";

const EMPTY = { count: 0, average: null, histogram: [0, 0, 0, 0, 0] };
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function Star({ fill = 0 }) {
  const id = useId();
  return <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id={id}><stop offset={`${fill * 100}%`} stopColor="currentColor"/><stop offset={`${fill * 100}%`} stopColor="transparent"/></linearGradient></defs><path fill={`url(#${id})`} stroke="currentColor" d="m12 2.4 3 6.1 6.8 1-4.9 4.8 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1z"/></svg>;
}

function Stars({ rating, summary = false }) {
  const rounded = summary ? Math.round(Number(rating || 0) * 2) / 2 : Number(rating || 0);
  return <span className="issue-reviews-stars" aria-label={`${rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} fill={Math.max(0, Math.min(1, rounded - n + 1))} />)}</span>;
}

function RatingEditor({ value, onChange }) {
  function keyDown(event) {
    if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    onChange(Math.max(1, Math.min(5, (value || 1) + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1))));
  }
  return <div className="issue-reviews-picker" role="radiogroup" aria-label="Your rating" onKeyDown={keyDown}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} stars`} onClick={() => onChange(n)}><Star fill={n <= value ? 1 : 0} /></button>)}</div>;
}

function ReviewRow({ review, mine, followed }) {
  const [expanded, setExpanded] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const replies = Number(review.reply_count) || 0;
  const edited = new Date(review.updated_at).getTime() - new Date(review.created_at).getTime() > 60000;
  return <article className={`issue-reviews-item${review.body ? "" : " issue-reviews-item--compact"}`}>
    <Link href={`/u/${encodeURIComponent(review.username)}`} className="issue-reviews-avatar"><Avatar profile={review} width={42} height={42} /></Link>
    <div className="issue-reviews-content"><div className="issue-reviews-meta"><Link href={`/u/${encodeURIComponent(review.username)}`}>@{review.username}</Link>{followed && <span className="issue-reviews-following">Following</span>}<Stars rating={review.rating}/><time dateTime={review.created_at}>{DATE.format(new Date(review.created_at))}{edited ? " · edited" : ""}</time></div>
      {review.body && <><p className={expanded ? "" : "issue-reviews-clamp"}>{review.body}</p>{review.body.length > 600 && <button type="button" className="issue-reviews-more" onClick={() => setExpanded((v) => !v)}>{expanded ? "Show less" : "Read more"}</button>}</>}
      <div className="issue-reviews-report">
        {review.body && (
          <button type="button" className="issue-reviews-replies" aria-expanded={repliesOpen} onClick={() => setRepliesOpen((open) => !open)}>
            {repliesOpen ? "Hide replies" : replies ? `${replies} ${replies === 1 ? "reply" : "replies"}` : "Reply"}
          </button>
        )}
        {mine ? <span>You</span> : <ReportButton targetType="review" targetId={review.id} ownerId={review.user_id} />}
      </div>
      {repliesOpen && <CommentThread targetType="review" targetId={review.id} title="Replies" compact id={`review-${review.id}-replies`} />}
    </div>
  </article>;
}

export default function IssueReviews({ issueId, initial }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [data, setData] = useState(initial ?? { summary: EMPTY, reviews: [] });
  const [mine, setMine] = useState(null);
  const [followed, setFollowed] = useState([]);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    const res = await authedFetch(`/api/reviews?issue=${issueId}`);
    const next = await res.json();
    if (!res.ok) throw new Error(next.error || "Could not load reviews.");
    setData(next); setMine(next.mine); setFollowed(next.followedIds ?? []);
    setRating(next.mine?.rating ?? 0); setBody(next.mine?.body ?? "");
  }
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    authedFetch(`/api/reviews?issue=${issueId}`).then(async (res) => {
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Could not load reviews.");
      if (!active) return;
      setData(next); setMine(next.mine); setFollowed(next.followedIds ?? []);
      setRating(next.mine?.rating ?? 0); setBody(next.mine?.body ?? "");
    }).catch(() => {});
    return () => { active = false; };
  }, [user, issueId]);

  const reviews = useMemo(() => {
    if (!mine || data.reviews?.some((review) => review.id === mine.id)) return data.reviews ?? [];
    const profile = user?.user_metadata ?? {};
    return [{ ...mine, username: profile.username || profile.user_name || "you", avatar_url: profile.avatar_url }, ...(data.reviews ?? [])];
  }, [data.reviews, mine, user]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const res = await authedFetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issue: issueId, rating, body }) });
      const saved = await res.json(); if (!res.ok) throw new Error(saved.error || "Could not save review.");
      setMine(saved); await refresh(); setMessage("Saved"); trackEvent("review_saved", { rating, has_body: Boolean(body.trim()) });
      setTimeout(() => setMessage((value) => value === "Saved" ? "" : value), 2000);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setMessage("");
    try { const res = await authedFetch(`/api/reviews?issue=${issueId}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "Could not delete review."); setMine(null); setRating(0); setBody(""); await refresh(); trackEvent("review_deleted"); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  const summary = data.summary ?? EMPTY;
  const max = Math.max(1, ...summary.histogram);
  return <section id="reviews" className="issue-discogs-section">
    <div className="issue-section-heading"><h2>Ratings and reviews</h2>{summary.count > 0 && <span>{summary.count} {summary.count === 1 ? "rating" : "ratings"}</span>}</div>
    {summary.count > 0 && <div className="issue-reviews-summary"><div className="issue-reviews-average"><strong>{summary.average.toFixed(1)}</strong><Stars rating={summary.average} summary /></div><div className="issue-reviews-histogram">{[5, 4, 3, 2, 1].map((n) => <div key={n}><span>{n}</span><span className="issue-reviews-bar"><i style={{ width: `${(summary.histogram[n - 1] / max) * 100}%` }} /></span><small>{summary.histogram[n - 1]}</small></div>)}</div></div>}
    {summary.count === 0 && <div className="issue-empty-card">No ratings yet. Be the first to rate this issue.</div>}
    {!loading && !user && <p className="issue-reviews-signin"><Link href={`/login?next=${encodeURIComponent(pathname || `/issue/gcd-${issueId}`)}`}>Sign in to rate this issue</Link></p>}
    {user && <form className="issue-reviews-form" onSubmit={save}><label>Your rating</label><RatingEditor value={rating} onChange={setRating}/>{(rating > 0 || body) && <><label htmlFor="issue-review-body">Write a review (optional)</label><textarea id="issue-review-body" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} rows={5} placeholder="What makes this issue worth reading or owning?"/>{body.length >= 1800 && <span className="issue-reviews-counter" aria-live="polite">{body.length} / 2,000</span>}</>}<div className="issue-reviews-actions"><button className="issue-reviews-save" disabled={busy || !rating}>{busy ? "Saving..." : "Save"}</button>{mine && <button type="button" className="issue-reviews-delete" disabled={busy} onClick={remove}>Delete</button>}</div>{message && <p role={message === "Saved" ? "status" : "alert"} className={message === "Saved" ? "issue-reviews-saved" : "issue-reviews-error"}>{message}</p>}</form>}
    {reviews.length > 0 && <div className="issue-reviews-list">{reviews.slice(0, showAll ? reviews.length : 10).map((review) => <ReviewRow key={review.id} review={review} mine={review.user_id === user?.id} followed={followed.includes(String(review.user_id))}/>)}</div>}
    {!showAll && reviews.length > 10 && <button type="button" className="issue-reviews-show-all" onClick={() => setShowAll(true)}>Show all {reviews.length} reviews</button>}
  </section>;
}
