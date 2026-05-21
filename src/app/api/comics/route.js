import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "@/lib/featuredSeries";

// Weekly rotation seed: ISO-week index since epoch. Same value for all
// requests within one calendar week → carousel looks identical to a user
// reloading the page on Monday afternoon and Friday morning, but flips to a
// new mix the following Monday. Adds liveliness without cron infra.
function currentWeekIndex() {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(now / oneWeekMs);
}

// Deterministic shuffle: same `seed` → same output order. Mulberry32 over
// a hashed seed. Tier ordering is preserved by shuffling *within* each tier
// rather than across the whole list — Tier 1 (current heat) always leads.
function seededShuffle(arr, seed) {
  // Mulberry32 PRNG — small, decent distribution, deterministic.
  let s = (seed | 0) || 1;
  const rand = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rotateFeaturedSeries(week) {
  // Bucket by tier (default 5 for entries missing the field), shuffle each
  // bucket with a tier-offset seed so different tiers get different orderings,
  // then concatenate tier1 → tier2 → tier3 → tier4.
  const byTier = new Map();
  for (const entry of FEATURED_SERIES) {
    const tier = entry.tier ?? 5;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(entry);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const out = [];
  for (const tier of tiers) {
    out.push(...seededShuffle(byTier.get(tier), week * 1000 + tier));
  }
  return out;
}

// GET /api/comics — the no-query "browse" surface for /search + the homepage
// Featured Series carousel.
//
// History:
//   v1: flat dump of user-added comics (garbage "Untitled #[nn]" rows). Removed.
//   v2: series tiles filtered to US allowlist, ordered by issue_count DESC.
//       Problem: surfaced Four Color 1942, Beano, Beezer, Detective Comics 1937
//       — accurate but "old persons website" energy. Modern hot books like
//       Absolute Batman (2024, 11 issues) buried at the bottom.
//   v3 (current): curated FEATURED_SERIES list — explicit modern picks
//       ordered by tier. Mirrors how Discogs surfaces "trending" rather than
//       algorithmically dredging the longest catalog entries.
//
// Each FEATURED_SERIES entry is matched to a real `series` row by
// (title, publisher) with prefer_year picking the right volume when multiple
// runs share a title. Entries that don't match anything in DB, or whose match
// has no cover yet, are silently dropped — the carousel only shows what we
// can actually render.

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 36), 100));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Rotate the curated list weekly so the carousel looks alive — same view
    // for a whole calendar week, fresh order every Monday. Tier 1 still leads.
    const weekIndex = currentWeekIndex();
    const rotatedFeatured = rotateFeaturedSeries(weekIndex);

    // Pull every series row matching any (title, publisher) pair from the
    // curated list. We can't compose a clean IN clause for tuples in
    // PostgREST, so we batch by distinct titles instead — the publisher
    // filter happens in JS below.
    const distinctTitles = [...new Set(rotatedFeatured.map((e) => e.title))];

    const { data: candidates, error } = await supabase
      .from("series")
      .select(
        "id, title, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached"
      )
      .in("title", distinctTitles)
      .not("featured_cover_path_cached", "is", null);

    if (error) {
      console.error("GET /api/comics featured series failed:", error);
      return NextResponse.json({ comics: [] });
    }

    // Bucket candidates by (title, publisher) for fast lookup. Same title can
    // exist under different publishers (Batman / DC, Batman / Ediciones).
    const byTitlePub = new Map();
    for (const row of candidates ?? []) {
      const key = `${row.title.toLowerCase()}::${(row.resolved_publisher_cached ?? "").toLowerCase()}`;
      if (!byTitlePub.has(key)) byTitlePub.set(key, []);
      byTitlePub.get(key).push(row);
    }

    // For each rotated entry, find the best matching series row.
    // prefer_year is the tiebreaker when multiple volumes share the title +
    // publisher (Amazing Spider-Man 1963 vs 1999 vs 2022).
    const resolved = [];
    for (const entry of rotatedFeatured) {
      const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
      const pool = byTitlePub.get(key) ?? [];
      if (pool.length === 0) continue; // no match in DB, or no cover — silently drop

      let best = pool[0];
      if (pool.length > 1 && entry.prefer_year != null) {
        let bestDelta = Infinity;
        for (const row of pool) {
          const ys = row.year_start_cached;
          if (ys == null) continue;
          const delta = Math.abs(ys - entry.prefer_year);
          if (delta < bestDelta) {
            best = row;
            bestDelta = delta;
          }
        }
      }

      resolved.push({ entry, row: best });
    }

    // The natural order is FEATURED_SERIES order (which encodes tier 1 → 4),
    // so we don't need to sort beyond that. Pagination is just a slice.
    const sliced = resolved.slice(offset, offset + limit);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const comics = sliced.map(({ row }) => ({
      id: `series-${row.id}`,
      series_id: row.id,
      series_title: row.title ?? "Untitled",
      publisher: row.resolved_publisher_cached ?? "Unknown Publisher",
      issue_number: null,
      release_year: row.year_start_cached ?? null,
      issue_count: row.issue_count_cached ?? 0,
      cover_path: row.featured_cover_path_cached
        ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${row.featured_cover_path_cached}`
        : null,
      created_by: null,
      __source: "series",
    }));

    return NextResponse.json({ comics });
  } catch (err) {
    console.error("GET /api/comics crashed:", err);
    return NextResponse.json({ comics: [] });
  }
}

export async function POST(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let formData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid form submission" },
      { status: 400 }
    );
  }

  const series_title = formData.get("series_title");
  const issue_number = formData.get("issue_number");
  const publisher_name = formData.get("publisher");
  const release_year = formData.get("release_year");
  const coverFile = formData.get("cover");
  const created_by = formData.get("created_by");

  if (!series_title || !issue_number || !publisher_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    let { data: publisher } = await supabase
      .from("publishers")
      .select("*")
      .eq("name", publisher_name)
      .single();

    if (!publisher) {
      const { data: newPublisher, error } = await supabase
        .from("publishers")
        .insert({ name: publisher_name })
        .select()
        .single();

      if (error) throw error;
      publisher = newPublisher;
    }

    let { data: series } = await supabase
      .from("series")
      .select("*")
      .eq("title", series_title)
      .eq("publisher_id", publisher.id)
      .single();

    if (!series) {
      const { data: newSeries, error } = await supabase
        .from("series")
        .insert({
          title: series_title,
          publisher_id: publisher.id,
        })
        .select()
        .single();

      if (error) throw error;
      series = newSeries;
    }

    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .insert({
        series_id: series.id,
        series_title,
        publisher: publisher_name,
        issue_number,
        release_year: release_year ? Number(release_year) : null,
        created_by,
      })
      .select()
      .single();

    if (comicError) throw comicError;

    if (coverFile && coverFile.size > 0) {
      const path = `${comic.id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("comic-covers")
        .upload(path, coverFile, { upsert: true });

      if (!uploadError) {
        await supabase.from("comic_covers").insert({
          comic_id: comic.id,
          image_path: path,
          is_primary: true,
          uploaded_by: created_by,
        });
      }
    }

    return NextResponse.json({ comic }, { status: 201 });
  } catch (err) {
    console.error("POST /api/comics failed:", err);
    return NextResponse.json(
      { error: "Failed to create comic" },
      { status: 500 }
    );
  }
}
