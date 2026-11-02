"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { coverThumb } from "@/lib/coverThumb";
import PullListIssueCard from "@/components/pull-list/PullListIssueCard";
import styles from "./YourShelf.module.css";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const TODAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Skeleton({ tall = false }) { return <div className={`${styles.skeleton}${tall ? ` ${styles.tall}` : ""}`} aria-label="Loading" />; }
function ErrorCard({ retry }) { return <div className={styles.state} role="alert">This section could not load.<button type="button" onClick={retry}>Try again</button></div>; }

export default function YourShelf() {
  const [shelf, setShelf] = useState({ data: null, error: false, loading: true });
  const [pulls, setPulls] = useState({ data: null, error: false, loading: true });
  const [activity, setActivity] = useState({ data: null, error: false, loading: true });
  const [reload, setReload] = useState(0);

  useLayoutEffect(() => {
    document.documentElement.dataset.shelfReady = "1";
    return () => { delete document.documentElement.dataset.shelfReady; };
  }, []);

  useEffect(() => {
    let active = true;
    const load = (url, setter, pick = (body) => body) => authedFetch(url, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed");
      if (active) setter({ data: pick(body), error: false, loading: false });
    }).catch(() => { if (active) setter({ data: null, error: true, loading: false }); });
    load("/api/shelf", setShelf);
    load("/api/pull-list", setPulls);
    load("/api/activity", setActivity, (body) => (body.activity ?? []).filter((row) => row.comics));
    return () => { active = false; };
  }, [reload]);

  function saved(key, status) {
    setPulls((current) => ({ ...current, data: { ...current.data, weeks: current.data.weeks.map((week) => ({ ...week, items: week.items.map((item) => item.key === key ? { ...item, owned: status === "owned" || item.owned, wanted: status === "wishlist" || item.wanted } : item) })) } }));
  }
  const retry = () => setReload((value) => value + 1);
  // One-shots and graphic novels come through with no issue number.
  const bookLabel = (comic) => comic.issue_number ? `${comic.series_title} #${comic.issue_number}` : comic.series_title;
  const latestWeek = pulls.data?.weeks?.[0];

  // A section, not <main>: the root layout already wraps every page in one.
  return <section className={styles.page} aria-label="Your shelf">
    <div className={styles.heroGrid}>
      <section className={`${styles.card} ${styles.hero}`}>
        <p className={styles.eyebrow}>Your shelf · {TODAY.format(new Date())}</p>
        {shelf.loading ? <Skeleton tall /> : shelf.error ? <ErrorCard retry={retry} /> : <>
          {shelf.data.value?.total > 0 && <div className={styles.valueBlock}><strong>{money.format(shelf.data.value.total)}</strong><p>Estimated from current asking prices{shelf.data.value.priced_count != null ? ` · ${shelf.data.value.priced_count} of ${shelf.data.value.owned_count} books priced` : ""} · updated daily</p></div>}
          <div className={styles.stats}>
            <Link href="/library"><strong>{shelf.data.counts.books}</strong><span>Books</span></Link>
            <div><strong>{shelf.data.counts.keys}</strong><span>Keys</span></div>
            <Link href="/library"><strong>{shelf.data.counts.runs_complete}</strong><span>Runs complete</span></Link>
            <Link href="/library?tab=wishlist"><strong>{shelf.data.counts.wantlist}</strong><span>On wantlist</span></Link>
          </div>
        </>}
      </section>
      <section className={`${styles.card} ${styles.recent}`}>
        <h2>Recently added</h2>
        {shelf.loading ? <Skeleton /> : shelf.error ? <ErrorCard retry={retry} /> : shelf.data.recent.length ? <div className={styles.recentGrid}>{shelf.data.recent.map((item) => <Link href={item.href} key={item.gcd_issue_id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.cover_url ? coverThumb(item.cover_url) : "/fallback-cover.png"} alt="" /><span>{item.title} #{item.issue_number}</span>
        </Link>)}</div> : <div className={styles.state}>Add your first book.<div><Link href="/scan">Scan a cover</Link> · <Link href="/library">Open your library</Link></div></div>}
      </section>
    </div>

    <section className={styles.section}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>New this week</p><h2>{latestWeek ? `Out ${SHORT_DATE.format(new Date(`${latestWeek.label_date}T00:00:00Z`))}` : "Your pull list"}</h2></div><Link href="/pull-list">See your pull list →</Link></div>
      {pulls.loading ? <Skeleton tall /> : pulls.error ? <ErrorCard retry={retry} /> : !pulls.data.series.length ? <div className={`${styles.card} ${styles.state}`}>Follow the series you buy. Their new issues show up here every week.<Link href="/pull-list">Choose your series</Link></div> : !latestWeek ? <div className={`${styles.card} ${styles.state}`}>Nothing new from your series in the last six weeks.</div> : <div className={`pull-issue-grid ${styles.pullGrid}`}>{latestWeek.items.slice(0, 6).map((item) => <PullListIssueCard key={item.key} item={item} onSaved={saved} />)}</div>}
    </section>

    {!shelf.loading && !shelf.error && shelf.data.runs.length > 0 && <section className={styles.section}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>Close the gaps</p><h2>Finish a run</h2></div></div>
      <div className={styles.runGrid}>{shelf.data.runs.map((run) => { const extra = run.missing - run.missing_preview.length; return <article className={styles.card} key={run.series_id}>
        <div className={styles.runTop}><div><Link href={run.href}>{run.title}</Link><span>{run.publisher}</span></div><strong>{run.pct}%</strong></div>
        <div className={styles.progress}><i style={{ width: `${run.pct}%` }} /></div><p>{run.owned} of {run.total} collected</p>
        <p>{run.missing === 1 ? `Missing #${run.missing_preview[0]}` : `Missing ${run.missing_preview.map((number) => `#${number}`).join(", ")}${extra > 0 ? ` and ${extra} more` : ""}`}</p>
        {run.for_sale > 0 && <Link className={styles.saleButton} href={run.href}>{run.for_sale} gap {run.for_sale === 1 ? "issue" : "issues"} for sale</Link>}
      </article>; })}</div>
    </section>}

    {!activity.loading && !activity.error && activity.data.length > 0 && <section className={styles.section}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>From the community</p><h2>Collector activity</h2></div></div>
      <div className={`${styles.card} ${styles.activity}`}>{activity.data.slice(0, 6).map((row, index) => <div key={`${row.created_at}:${index}`}>
        <span>{row.profiles.username ? <Link href={`/u/${encodeURIComponent(row.profiles.username)}`}>@{row.profiles.username}</Link> : "A collector"} {row.status === "wishlist" ? "wanted" : row.status === "for_sale" ? "listed" : "added"} {row.comics?.id?.startsWith("gcd-") ? <Link href={`/issue/${row.gcd_issue_id}`}>{bookLabel(row.comics)}</Link> : <strong>{bookLabel(row.comics)}</strong>}</span>
      </div>)}</div>
    </section>}
  </section>;
}
