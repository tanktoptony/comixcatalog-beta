"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowRight, Camera, Search, Store, Tag } from "lucide-react";
import { authedFetch } from "@/lib/apiClient";
import { coverThumb } from "@/lib/coverThumb";
import { useAuth } from "@/context/AuthContext";
import PullListIssueCard from "@/components/pull-list/PullListIssueCard";
import InviteButton from "@/components/InviteButton";
import CollectorFeed from "./CollectorFeed";
import styles from "./YourShelf.module.css";
import { issueNumberText } from "@/lib/issueNumberLabel";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const TODAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// $5, $8.40: whole dollars drop the cents, anything else shows both digits.
const cents = { format: (v) => Number.isInteger(Number(v)) ? money.format(v) : dollars.format(v) };
const count = (n) => Number(n ?? 0).toLocaleString("en-US");

// The support card links here and shows to every member, founders included.
// Set to null to fall back to Collector+, which only members without a
// membership can join.
const PATREON_URL = "https://www.patreon.com/comixcatalog";

function Skeleton({ tall = false }) { return <div className={`${styles.skeleton}${tall ? ` ${styles.tall}` : ""}`} aria-label="Loading" />; }
function ErrorCard({ retry }) { return <div className={styles.state} role="alert">This section could not load.<button type="button" onClick={retry}>Try again</button></div>; }

function Cover({ src }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src ? coverThumb(src) : "/fallback-cover.png"} alt="" loading="lazy" />;
}

function ValueChange({ change }) {
  if (!change || Math.abs(change.amount) < 1) return null;
  const up = change.amount > 0;
  return <span className={up ? styles.up : styles.down}>{up ? "+" : "−"}{money.format(Math.abs(change.amount))} since {SHORT_DATE.format(new Date(`${change.since}T00:00:00Z`))}</span>;
}

export default function YourShelf() {
  const { user, profile, isFounding, isPro, isPlus } = useAuth();
  const [shelf, setShelf] = useState({ data: null, error: false, loading: true });
  const [hunt, setHunt] = useState({ data: null, error: false, loading: true });
  const [pulls, setPulls] = useState({ data: null, error: false, loading: true });
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
    load("/api/shelf/hunt", setHunt);
    load("/api/pull-list", setPulls);
    return () => { active = false; };
  }, [reload]);

  function saved(key, status) {
    setPulls((current) => ({ ...current, data: { ...current.data, weeks: current.data.weeks.map((week) => ({ ...week, items: week.items.map((item) => item.key === key ? { ...item, owned: status === "owned" || item.owned, wanted: status === "wishlist" || item.wanted } : item) })) } }));
  }
  const retry = () => setReload((value) => value + 1);
  const issueLabel = (title, number) => number ? `${title} #${number}` : title;
  const latestWeek = pulls.data?.weeks?.[0];
  const value = shelf.data?.value;
  const wantlist = hunt.data?.wantlist;
  const market = hunt.data?.market;
  const selling = hunt.data?.selling;
  const canJoinPlus = !isFounding && !isPro && !isPlus;
  const showSupport = Boolean(PATREON_URL) || canJoinPlus;

  // A section, not <main>: the root layout already wraps every page in one.
  return <section className={styles.page} aria-label="Your shelf">
    <div className={styles.heroGrid}>
      <section className={`${styles.card} ${styles.hero}`}>
        <p className={styles.eyebrow}>Your shelf · {TODAY.format(new Date())}</p>
        {shelf.loading ? <Skeleton tall /> : shelf.error ? <ErrorCard retry={retry} /> : <>
          {value?.total > 0 ? <div className={styles.valueBlock}>
            <strong>{money.format(value.total)}</strong>
            <p>
              <ValueChange change={value.change} />
              {value.priced_count != null && <span>{count(value.priced_count)} of {count(value.owned_count)} books valued</span>}
              <a href="https://www.pricecharting.com/" target="_blank" rel="noopener">Values by PriceCharting</a>
            </p>
          </div> : <div className={styles.valueBlock}><p className={styles.valueEmpty}>Add books to your collection and their value adds up here, from real sold prices.</p></div>}
          <div className={styles.actions}>
            <Link href="/scan" className={styles.primary}><Camera aria-hidden="true" />Scan a cover</Link>
            <Link href="/marketplace"><Store aria-hidden="true" />Shop the marketplace</Link>
            <Link href="/sell"><Tag aria-hidden="true" />Sell a book</Link>
          </div>
          {selling?.listed > 0 && <Link href="/library?tab=for_sale" className={styles.selling}>
            <span className={styles.sellingLabel}>Your listings</span>
            <span><b>{count(selling.listed)}</b> listed · <b>{count(selling.priced)}</b> priced · <b className={selling.ready ? styles.up : ""}>{count(selling.ready)}</b> ready for Buy now</span>
            <span className={styles.sellingCta}>{selling.ready < selling.listed ? "Add prices and conditions" : "Manage listings"} <ArrowRight aria-hidden="true" /></span>
          </Link>}
          <div className={styles.stats}>
            <Link href="/library"><strong>{count(shelf.data.counts.books)}</strong><span>Books</span></Link>
            <div><strong>{count(shelf.data.counts.keys)}</strong><span>Keys</span></div>
            <Link href="/library"><strong>{count(shelf.data.counts.runs_complete)}</strong><span>Runs complete</span></Link>
            <Link href="/library?tab=wishlist"><strong>{count(shelf.data.counts.wantlist)}</strong><span>On wantlist</span></Link>
          </div>
        </>}
      </section>
      <section className={`${styles.card} ${styles.recent}`}>
        <h2>Recently added</h2>
        {shelf.loading ? <Skeleton /> : shelf.error ? <ErrorCard retry={retry} /> : shelf.data.recent.length ? <div className={styles.recentGrid}>{shelf.data.recent.map((item) => <Link href={item.href} key={item.gcd_issue_id}>
          <Cover src={item.cover_url} /><span>{item.title} {issueNumberText(item.issue_number)}</span>
        </Link>)}</div> : <div className={styles.state}>Add your first book.<div><Link href="/scan">Scan a cover</Link> · <Link href="/library">Open your library</Link></div></div>}
      </section>
    </div>

    <section className={styles.section}>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>What you&rsquo;re hunting</p><h2>Your wantlist</h2>
          {wantlist?.count > 0 && <p className={styles.sub}>
            {count(wantlist.count)} {wantlist.count === 1 ? "book" : "books"}
            {wantlist.priced > 0 && <> · about {money.format(wantlist.guide_total)} for raw copies at guide</>}
            {wantlist.listed > 0 && <> · <b>{count(wantlist.listed)} for sale now</b></>}
          </p>}
        </div>
        {wantlist?.count > 0 && <Link href="/library?tab=wishlist">See your wantlist <ArrowRight aria-hidden="true" /></Link>}
      </div>
      {hunt.loading ? <Skeleton tall /> : hunt.error ? <div className={styles.card}><ErrorCard retry={retry} /></div> : !wantlist.count
        ? <div className={`${styles.card} ${styles.state}`}>Add the books you&rsquo;re hunting for. Each one shows its guide price here, and we flag it when a copy is listed for sale.<Link href="/search"><Search aria-hidden="true" />Search the catalog</Link></div>
        : <div className={styles.bookGrid}>{wantlist.items.map((item) => <article key={item.gcd_issue_id} className={styles.book}>
          <Link href={item.listing?.href ?? item.href} className={styles.bookCover}>
            <Cover src={item.cover_url} />
            {item.for_sale > 0 && <span className={styles.tagSale}>For sale</span>}
          </Link>
          <Link href={item.href} className={styles.bookTitle}>{issueLabel(item.title, item.issue_number)}</Link>
          {item.listing
            ? <Link href={item.listing.href} className={styles.bookPrice}>{item.listing.price != null ? cents.format(item.listing.price) : "Ask the seller"}{item.for_sale > 1 ? <small> · {item.for_sale} copies</small> : null}</Link>
            : <span className={styles.bookMuted}>Not listed yet</span>}
          {item.guide && <a href={item.guide.url} target="_blank" rel="noopener" className={styles.bookGuide}>Guide {cents.format(item.guide.value)} raw</a>}
        </article>)}</div>}
    </section>

    <CollectorFeed />

    <div className={`${styles.section} ${styles.band}${showSupport ? "" : ` ${styles.bandSingle}`}`}>
      {profile?.username && <section className={`${styles.card} ${styles.bandCard}`}>
        <p className={styles.eyebrow}>Bring a collector</p>
        <h2>Comics are better with friends</h2>
        <p>Send a collector your invite link. You&rsquo;ll see each other&rsquo;s shelves, and trade matches show the books you could swap.</p>
        <div className={styles.bandActions}>
          <InviteButton username={profile.username} ownerId={user?.id} className={styles.bandButton} />
          <Link href="/matches">See your trade matches</Link>
        </div>
      </section>}
      {showSupport && <section className={`${styles.card} ${styles.bandCard}`}>
        <p className={styles.eyebrow}>Keep it independent</p>
        <h2>Support ComixCatalog</h2>
        <p>Built by one collector in Chicago, without third-party ads or selling your data. Supporters keep it that way.</p>
        <div className={styles.bandActions}>
          {PATREON_URL
            ? <a href={PATREON_URL} target="_blank" rel="noopener" className={styles.bandButton}>Support on Patreon</a>
            : <Link href="/upgrade" className={styles.bandButton}>Join Collector+</Link>}
        </div>
      </section>}
    </div>

    <section className={styles.section}>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Go hunting</p><h2>In the marketplace</h2>
          {market?.stats?.listed > 0 && <p className={styles.sub}>
            {count(market.stats.listed)} books from {count(market.stats.sellers)} {market.stats.sellers === 1 ? "collector" : "collectors"}
            {market.stats.keys > 0 && <> · {count(market.stats.keys)} key {market.stats.keys === 1 ? "issue" : "issues"}</>}
            {market.stats.underGuide > 0 && <> · {count(market.stats.underGuide)} under guide</>}
          </p>}
        </div>
        <Link href="/marketplace">Browse the marketplace <ArrowRight aria-hidden="true" /></Link>
      </div>
      {hunt.loading ? <Skeleton tall /> : hunt.error ? <div className={styles.card}><ErrorCard retry={retry} /></div> : !market.picks.length
        ? <div className={`${styles.card} ${styles.state}`}>Nothing listed from other collectors yet. Be the first: list a book from your collection.<Link href="/sell">How selling works</Link></div>
        : <div className={styles.bookGrid}>{market.picks.map((l) => <article key={l.id} className={styles.book}>
          <Link href={l.href} className={styles.bookCover}>
            <Cover src={l.cover} />
            {l.key && <span className={styles.tagKey}>Key</span>}
            {l.buy_now && <span className={styles.tagSale}>Buy now</span>}
          </Link>
          <Link href={l.href} className={styles.bookTitle}>{l.name ?? issueLabel(l.title, l.issue_number)}</Link>
          {l.key && <span className={styles.bookKey}>{l.key}</span>}
          <Link href={l.href} className={styles.bookPrice}>{l.price != null ? cents.format(l.price) : "Ask the seller"}</Link>
          {l.guide && <a href={l.guide.url} target="_blank" rel="noopener" className={styles.bookGuide}>Guide {cents.format(l.guide.value)}</a>}
        </article>)}</div>}
    </section>

    <section className={styles.section}>
      <div className={styles.heading}><div><p className={styles.eyebrow}>New this week</p><h2>{latestWeek ? `Out ${SHORT_DATE.format(new Date(`${latestWeek.label_date}T00:00:00Z`))}` : "Your pull list"}</h2></div><Link href="/pull-list">See your pull list <ArrowRight aria-hidden="true" /></Link></div>
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
  </section>;
}
