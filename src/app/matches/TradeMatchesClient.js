"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { coverThumb } from "@/lib/coverThumb";
import Avatar from "@/components/Avatar";

function MatchCard({ match, mode }) {
  const first = mode === "have" ? match.youHave[0] : match.theyHave[0];
  const ask = mode === "have" ? "have" : "sell";
  const about = first ? `${first.title}${first.issueNumber ? ` #${first.issueNumber}` : ""}` : "a comic";
  const messageHref = `/inbox/${encodeURIComponent(match.username)}?issue=${first?.id ?? ""}&ask=${ask}&about=${encodeURIComponent(about)}`;
  const open = new Set(match.openToTrade.map(String));
  const row = (books) => <div className="trade-cover-row">{books.slice(0, 6).map((book) => (
    <Link href={book.href} key={book.id} className="trade-cover">
      {book.coverUrl
        // eslint-disable-next-line @next/next/no-img-element -- Supabase storage covers, same as the rest of the site
        ? <img src={coverThumb(book.coverUrl)} alt={`${book.title}${book.issueNumber ? ` #${book.issueNumber}` : ""}`} loading="lazy" />
        : <em className="trade-cover-text">{book.title}{book.issueNumber ? ` #${book.issueNumber}` : ""}</em>}
      {open.has(String(book.id)) && <span>Open to trade</span>}
    </Link>
  ))}</div>;
  return <article className="trade-match-card">
    <header><Avatar profile={match} width={48} height={48} /><Link href={`/u/${encodeURIComponent(match.username)}`}>@{match.username}</Link></header>
    {match.theyHave.length > 0 && <div><p>Has {match.theyHave.length} from your wantlist</p>{row(match.theyHave)}</div>}
    {match.youHave.length > 0 && <div><p>Wants {match.youHave.length} you own</p>{row(match.youHave)}</div>}
    <Link className="profile-action-btn message-button trade-message" href={messageHref}>Message</Link>
  </article>;
}

export default function TradeMatchesClient() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, matches: [], hasWantlist: false });
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await authedFetch("/api/trade-matches");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load matches.");
      setState({ loading: false, error: null, matches: data.matches ?? [], hasWantlist: Boolean(data.hasWantlist) });
    } catch (error) { setState({ loading: false, error: error.message, matches: [], hasWantlist: false }); }
  }, [user]);
  useEffect(() => {
    // The authenticated request is the external system this effect starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) load();
  }, [user, load]);

  if (authLoading) return <main className="trade-matches-page"><div className="trade-skeleton" /><div className="trade-skeleton" /></main>;
  if (!user) return <main className="trade-matches-page"><h1>Trade matches</h1><p>See who has books you want and who is looking for books on your shelf.</p><Link className="trade-primary" href="/login?next=/matches">Sign in to find matches</Link></main>;
  if (state.loading) return <main className="trade-matches-page"><h1>Trade matches</h1><div className="trade-skeleton" /><div className="trade-skeleton" /></main>;
  if (state.error) return <main className="trade-matches-page"><h1>Trade matches</h1><div className="trade-state"><p>{state.error}</p><button onClick={() => { setState((current) => ({ ...current, loading: true, error: null })); load(); }}>Try again</button></div></main>;
  if (!state.matches.length) return <main className="trade-matches-page"><h1>Trade matches</h1><div className="trade-state">{state.hasWantlist ? <p>No matches yet. As more collectors add their shelves, matches show up here.</p> : <><p>Add books to your wantlist and we&apos;ll find collectors who have them.</p><Link href="/search">Search comics</Link></>}</div></main>;
  const sections = [
    ["Both ways", state.matches.filter((m) => m.twoWay), "both"],
    ["Has what you want", state.matches.filter((m) => !m.twoWay && m.theyHave.length), "sell"],
    ["Wants what you have", state.matches.filter((m) => !m.twoWay && m.youHave.length), "have"],
  ];
  return <main className="trade-matches-page"><h1>Trade matches</h1><p className="trade-intro">Collectors whose shelves line up with yours.</p>{sections.map(([title, matches, mode]) => matches.length ? <section key={title}><h2>{title}</h2><div className="trade-match-grid">{matches.map((match) => <MatchCard key={match.username} match={match} mode={mode} />)}</div></section> : null)}</main>;
}
