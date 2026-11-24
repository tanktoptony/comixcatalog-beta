// Private members for Tony's own accounts (tanktop__ with two-factor, or
// test_tony): who set their profile to private, when they joined and last
// signed in, where they came from, and the books they have. Read only.

import { NextResponse } from "next/server";
import { requirePrivateMemberViewer } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const PAGE = 1000;
const ID_CHUNK = 200;

async function allRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function byIds(db, table, column, select, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await db.from(table).select(select).in(column, ids.slice(i, i + ID_CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

const yearOf = (value) => (value ? Number(String(value).slice(0, 4)) || null : null);

export async function GET(req) {
  const auth = await requirePrivateMemberViewer(req);
  if (auth.response) return auth.response;
  const db = getServiceClient();

  try {
    const profiles = await allRows(() =>
      db
        .from("profiles")
        .select("id, username, display_name, created_at, signup_source, signup_medium, signup_campaign")
        .eq("is_public", false)
        .not("username", "is", null)
        .order("created_at", { ascending: false })
    );
    if (!profiles.length) return NextResponse.json({ members: [] });

    const ids = profiles.map((p) => p.id);
    const copies = await allRows(() =>
      db
        .from("user_collections")
        .select("id, user_id, status, gcd_issue_id, comic_id, condition, grade_numeric, slab_company, variant_label, created_at")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
    );

    const issueIds = [...new Set(copies.map((c) => Number(c.gcd_issue_id)).filter(Boolean))];
    const issues = await byIds(db, "gcd_issues", "gcd_id", "gcd_id, issue_number, series_gcd_id, key_date, publication_date", issueIds);
    const seriesIds = [...new Set(issues.map((i) => i.series_gcd_id).filter(Boolean))];
    const series = await byIds(db, "gcd_series", "gcd_id", "gcd_id, name, year_began", seriesIds);
    const comicIds = [...new Set(copies.map((c) => c.comic_id).filter(Boolean))];
    const comics = await byIds(db, "comics", "id", "id, series_title, issue_number, release_year", comicIds);

    const issueById = new Map(issues.map((i) => [i.gcd_id, i]));
    const seriesById = new Map(series.map((s) => [s.gcd_id, s]));
    const comicById = new Map(comics.map((c) => [c.id, c]));

    function describe(copy) {
      const issue = issueById.get(Number(copy.gcd_issue_id));
      if (issue) {
        const s = seriesById.get(issue.series_gcd_id);
        return {
          series: s?.name ?? "Unknown series",
          series_year: s?.year_began ?? null,
          issue: issue.issue_number,
          year: yearOf(issue.publication_date) ?? yearOf(issue.key_date),
          href: `/issue/gcd-${issue.gcd_id}`,
        };
      }
      const comic = comicById.get(copy.comic_id);
      return {
        series: comic?.series_title ?? "Unknown book",
        series_year: null,
        issue: comic?.issue_number ?? null,
        year: comic?.release_year ?? null,
        href: comic ? `/comic/${comic.id}` : null,
      };
    }

    const members = [];
    for (const p of profiles) {
      const { data: authUser } = await db.auth.admin.getUserById(p.id);
      const theirs = copies.filter((c) => c.user_id === p.id);
      members.push({
        username: p.username,
        display_name: p.display_name,
        joined: p.created_at,
        last_sign_in: authUser?.user?.last_sign_in_at ?? null,
        email_confirmed: Boolean(authUser?.user?.email_confirmed_at),
        source: [p.signup_source, p.signup_medium, p.signup_campaign].filter(Boolean).join(" / ") || null,
        counts: {
          owned: theirs.filter((c) => c.status === "owned").length,
          for_sale: theirs.filter((c) => c.status === "for_sale").length,
          wantlist: theirs.filter((c) => c.status === "wishlist").length,
        },
        books: theirs.map((c) => ({
          id: c.id,
          status: c.status,
          condition: c.condition,
          grade: c.grade_numeric,
          slab: c.slab_company,
          variant: c.variant_label,
          added: c.created_at,
          ...describe(c),
        })),
      });
    }
    return NextResponse.json({ members });
  } catch (error) {
    console.error("private-members", error);
    return NextResponse.json({ error: "Could not load private members" }, { status: 500 });
  }
}
