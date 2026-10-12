"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

const PAGE_SIZE = 500;

export default function SoldHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseClient();
      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: readError } = await supabase
          .from("sold_items")
          .select("id, gcd_issue_id, comic_id, series_title, issue_number, variant_label, condition, grade_numeric, slab_company, sale_price, currency, sold_at")
          .order("sold_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (readError) throw readError;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
      if (!cancelled) setSales(rows);
    }
    load().catch((err) => !cancelled && setError(err.message)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const total = useMemo(() => sales.reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0), [sales]);

  if (!authLoading && !user) return <main className="library-page sold-history"><h1>Sold history</h1><p><Link href="/login">Sign in</Link> to see your private sold history.</p></main>;

  return (
    <main className="library-page sold-history">
      <header className="library-page-header"><div><p className="library-eyebrow">Your library</p><h1>Sold history</h1><p>Private to you. Sale prices are never shown on your public profile.</p></div></header>
      <nav className="library-tabs" aria-label="Library sections">
        <Link className="library-tab" href="/library">Collection</Link>
        <Link className="library-tab" href="/library?tab=wishlist">Wantlist</Link>
        <Link className="library-tab" href="/library?tab=for_sale">For sale</Link>
        <span className="library-tab active">Sold {sales.length > 0 && <span className="library-tab-count">{sales.length}</span>}</span>
      </nav>
      <section className="sold-summary"><span>Total sales</span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total)}</strong></section>
      {loading && <p>Loading sold history…</p>}
      {error && <p className="mark-sold-error" role="alert">Couldn&rsquo;t load sold history. {error}</p>}
      {!loading && !error && sales.length === 0 && <p className="sold-empty">Books you mark sold will appear here.</p>}
      {sales.length > 0 && <div className="sold-list">
        {sales.map((sale) => {
          const href = sale.gcd_issue_id ? `/issue/gcd-${sale.gcd_issue_id}` : sale.comic_id ? `/comic/${sale.comic_id}` : null;
          const grade = sale.slab_company && sale.grade_numeric != null ? `${sale.slab_company} ${Number(sale.grade_numeric).toFixed(1)}` : sale.condition || (sale.grade_numeric != null ? Number(sale.grade_numeric).toFixed(1) : "Not graded");
          return <article key={sale.id} className="sold-row">
            <time dateTime={sale.sold_at}>{new Date(sale.sold_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
            <div><strong>{href ? <Link href={href}>{sale.series_title}{sale.issue_number ? ` #${sale.issue_number}` : ""}</Link> : <>{sale.series_title}{sale.issue_number ? ` #${sale.issue_number}` : ""}</>}</strong>{sale.variant_label && <small>{sale.variant_label}</small>}</div>
            <span>{grade}</span>
            <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: sale.currency || "USD" }).format(Number(sale.sale_price))}</b>
          </article>;
        })}
      </div>}
    </main>
  );
}
