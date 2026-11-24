"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Trophy } from "lucide-react";
import Avatar from "@/components/Avatar";
import { authedFetch } from "@/lib/apiClient";
import { coverThumb } from "@/lib/coverThumb";
import styles from "./CollectorFeed.module.css";
import { issueNumberText } from "@/lib/issueNumberLabel";

const TABS = [{ id: "following", label: "Following" }, { id: "everyone", label: "Everyone" }];
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const count = (n) => Number(n ?? 0).toLocaleString("en-US");

function ago(at) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return DAY.format(new Date(at));
}

const bookLabel = (book) => book.issue_number ? `${book.title} ${issueNumberText(book.issue_number)}` : book.title;

function Phrase({ event }) {
  const n = event.count_is_floor ? `${count(event.count)}+` : count(event.count);
  const one = event.count === 1 && !event.count_is_floor ? event.books[0] : null;
  const book = one ? <Link href={one.href}>{bookLabel(one)}</Link> : null;
  if (event.verb === "finished") {
    const [first, second] = event.runs;
    const run = (r) => <Link href={r.href}>{r.title}</Link>;
    if (event.runs.length === 1) return <>finished a run: {run(first)}, all {count(first.total)} issues</>;
    if (event.runs.length === 2) return <>finished 2 runs: {run(first)} and {run(second)}</>;
    return <>finished {count(event.runs.length)} runs: {run(first)}, {run(second)} and {count(event.runs.length - 2)} more</>;
  }
  if (event.verb === "reviewed" || event.verb === "rated") return <>{event.verb} {book}</>;
  if (event.verb === "listed") return one ? <>listed {book} for sale</> : <>listed {n} books for sale</>;
  if (event.verb === "wants") return one ? <>is hunting for {book}</> : <>is hunting for {n} books</>;
  return one ? <>added {book}</> : <>added {n} books</>;
}

function Event({ event }) {
  const profileHref = `/u/${encodeURIComponent(event.user.username)}`;
  const shown = event.books.length;
  const more = event.count - shown;
  const finished = event.verb === "finished";
  const review = event.verb === "reviewed" || event.verb === "rated";
  return <article className={`${styles.event}${finished ? ` ${styles.finished}` : ""}`}>
    <Link href={profileHref} className={styles.avatar} aria-hidden="true" tabIndex={-1}>
      <Avatar profile={event.user} width={40} height={40} />
    </Link>
    <div className={styles.body}>
      <p className={styles.line}>
        <Link href={profileHref} className={styles.who}>@{event.user.username}</Link>{" "}
        <Phrase event={event} />
        <time dateTime={event.at}>{ago(event.at)}</time>
      </p>
      {review && <div className={styles.reviewDetail}><span aria-label={`${event.rating} out of 5 stars`}>{"★".repeat(event.rating)}{"☆".repeat(5 - event.rating)}</span>{event.excerpt && <blockquote>{event.excerpt}</blockquote>}</div>}
      {finished && <p className={styles.badge}><Trophy aria-hidden="true" />Run complete</p>}
      {(!finished || shown > 0) && <ul className={`${styles.strip}${review ? ` ${styles.reviewStrip}` : ""}`}>
        {event.books.map((book, index) => <li key={`${book.gcd_issue_id}:${index}`}>
          <Link href={book.href} title={bookLabel(book)}>
            {book.cover_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={coverThumb(book.cover_url)} alt={bookLabel(book)} loading="lazy" />
              : <span className={styles.noCover}>{bookLabel(book)}</span>}
            {book.price != null && <span className={styles.price}>{dollars.format(book.price)}</span>}
          </Link>
        </li>)}
        {more > 0 && !finished && <li><Link href={profileHref} className={styles.more} aria-label={`${more} more on @${event.user.username}'s shelf`}>
          +{count(more)}<span>more</span>
        </Link></li>}
      </ul>}
    </div>
  </article>;
}

async function fetchFeed(scope) {
  // No `cache: "no-store"`: that makes the browser send Cache-Control:
  // no-cache, which skips the server's cached member lists. The route marks
  // its own response private and no-store.
  const response = await authedFetch(`/api/feed?scope=${scope}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

export default function CollectorFeed() {
  const [tab, setTab] = useState(null);
  // scope -> { data } or { error }. No entry means it is loading.
  const [feeds, setFeeds] = useState({});

  const load = useCallback((scope) => fetchFeed(scope)
    .then((data) => { setFeeds((current) => ({ ...current, [scope]: { data } })); return data; })
    .catch(() => { setFeeds((current) => ({ ...current, [scope]: { error: true } })); return null; }), []);

  useEffect(() => {
    load("following").then((data) => {
      // Nobody followed yet: open on Everyone, keep the nudge on Following.
      if (data?.following === 0) {
        setTab("everyone");
        load("everyone");
      } else setTab("following");
    });
  }, [load]);

  const scope = tab ?? "following";
  function choose(id) {
    setTab(id);
    if (!feeds[id]?.data) {
      setFeeds((current) => { const { [id]: _drop, ...rest } = current; return rest; });
      load(id);
    }
  }
  const current = feeds[scope];
  const loading = !current || (tab === null && scope === "following" && !current.error && current.data?.following === 0);
  const followingCount = feeds.following?.data?.following;
  const events = current?.data?.events ?? [];

  return <section className={styles.section} aria-labelledby="collector-feed-title">
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>From the community</p>
        <h2 id="collector-feed-title">Collector feed</h2>
      </div>
      <Link href="/people" className={styles.find}>Find collectors <ArrowRight aria-hidden="true" /></Link>
    </div>
    <div className={styles.tabs} role="tablist" aria-label="Whose activity">
      {TABS.map((t) => <button key={t.id} type="button" role="tab" id={`feed-tab-${t.id}`} aria-selected={scope === t.id}
        aria-controls="collector-feed-panel" onClick={() => choose(t.id)}>
        {t.label}{t.id === "following" && followingCount > 0 ? <span>{count(followingCount)}</span> : null}
      </button>)}
    </div>
    <div className={styles.card} role="tabpanel" id="collector-feed-panel" aria-labelledby={`feed-tab-${scope}`}>
      {loading ? <div className={styles.skeleton} aria-label="Loading" />
        : current.error ? <div className={styles.state} role="alert">The feed could not load.<button type="button" onClick={() => choose(scope)}>Try again</button></div>
        : tab === "following" && current.data?.following === 0 ? <div className={styles.state}>
          <p>Follow collectors and you&rsquo;ll see what they add, list and finish, right here.</p>
          <div className={styles.stateActions}><Link href="/people" className={styles.button}>Find collectors</Link><button type="button" onClick={() => choose("everyone")}>See everyone</button></div>
        </div>
        : events.length === 0 ? <div className={styles.state}>
          <p>{tab === "following" ? "Nobody you follow has added a book in the last 30 days." : "No collector activity in the last 30 days."}</p>
          {tab === "following" && <div className={styles.stateActions}><button type="button" onClick={() => choose("everyone")}>See everyone</button></div>}
        </div>
        : <div className={styles.list}>{events.map((event) => <Event key={event.id} event={event} />)}</div>}
    </div>
  </section>;
}
