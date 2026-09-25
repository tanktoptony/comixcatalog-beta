import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { ADMIN_ID } from "@/lib/admin";
import { getAuthedUser } from "@/lib/authServer";
import {
  normalizeKey,
  matchIssue,
  chooseSeries,
  ambiguityMessage,
} from "@/lib/csvImport/matchRow";

// Tiered row caps. Free is the hook (you can try CSV import); Pro raises the
// ceiling for bulk imports of a real collection. The Pro cap matches the
// historical 200-row global cap so existing Pro users see no regression; free
// gets a lower bar that's enough to evaluate the feature.
const FREE_ROW_CAP = 25;
const PRO_ROW_CAP = 200;

export async function POST(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = authedUser.id;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "Missing file" },
        { status: 400 }
      );
    }

    const text = await file.text();

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (!parsed.meta || !parsed.meta.fields) {
      return NextResponse.json(
        { error: "Invalid CSV structure" },
        { status: 400 }
      );
    }

    const headers = parsed.meta.fields.map((h) =>
      h.toLowerCase().trim()
    );

    const requiredColumns = ["series_title", "issue_number", "publisher"];

    for (const col of requiredColumns) {
      if (!headers.includes(col)) {
        return NextResponse.json(
          {
            results: {
              created: 0,
              reused: 0,
              attached: 0,
              skipped: 0,
              errors: [
                {
                  row: "-",
                  message: `Missing required column: ${col}`,
                },
              ],
            },
          },
          { status: 400 }
        );
      }
    }

    const rows = parsed.data;

    // Pro-tier check: lift the row cap from FREE_ROW_CAP to PRO_ROW_CAP for
    // Pro/founding subscribers (and ADMIN_ID). Matches the auth posture of
    // /api/export/pdf and /api/export/csv — we return 402 with upgrade: true so
    // the library UI can redirect to /upgrade.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", user_id)
      .single();
    const isProOrAdmin =
      Boolean(profile?.is_pro) || user_id === ADMIN_ID;
    const rowCap = isProOrAdmin ? PRO_ROW_CAP : FREE_ROW_CAP;

    if (rows.length > rowCap) {
      if (!isProOrAdmin) {
        return NextResponse.json(
          {
            error: `Free import is limited to ${FREE_ROW_CAP} rows. Upgrade to Collector Pro to import up to ${PRO_ROW_CAP}.`,
            upgrade: true,
            limit: FREE_ROW_CAP,
            attempted: rows.length,
          },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: `CSV exceeds ${PRO_ROW_CAP} row limit`, limit: PRO_ROW_CAP },
        { status: 400 }
      );
    }

    const results = {
      created: 0,
      reused: 0,
      attached: 0,
      skipped: 0,
      matchedToCatalog: 0,
      ambiguous: 0,
      errors: [],
    };

    const seenRows = new Set();

    // Catalog prefetch.
    //
    // Resolution used to be three queries per row, which at the 200-row Pro
    // cap is 600 round trips. Every distinct title in the file is loaded
    // once here instead, and the per-row work below is then in-memory.
    //
    // Paginated, because PostgREST caps a read at 1000 rows with no error
    // and no truncation signal (OPERATIONS_HANDOFF 2a) — and a truncated
    // candidate list would look exactly like "this series is not in the
    // catalog", which is the branch that used to invent a duplicate.
    const wantedTitles = [
      ...new Set(
        rows
          .map((r) => {
            const key = Object.keys(r).find((k) => k.toLowerCase().trim() === "series_title");
            return normalizeKey(key ? r[key] : "");
          })
          .filter(Boolean)
      ),
    ];

    const seriesByTitle = new Map();
    for (let c = 0; c < wantedTitles.length; c += 100) {
      const chunk = wantedTitles.slice(c, c + 100);
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("series")
          .select("id, gcd_id, title, title_normalized, year_start_cached, issue_count_cached, resolved_publisher_cached")
          .in("title_normalized", chunk)
          .not("gcd_id", "is", null)
          .order("id")
          .range(from, from + 999);
        if (error) {
          return NextResponse.json(
            { error: `Could not read the catalog: ${error.code ?? "?"} ${error.message}` },
            { status: 500 }
          );
        }
        for (const row of data ?? []) {
          const k = row.title_normalized;
          if (!seriesByTitle.has(k)) seriesByTitle.set(k, []);
          seriesByTitle.get(k).push(row);
        }
        if (!data || data.length < 1000) break;
      }
    }

    // Issue lists, loaded lazily per series and cached for the file.
    const issuesBySeriesGcd = new Map();
    async function issuesFor(seriesGcdId) {
      if (issuesBySeriesGcd.has(seriesGcdId)) return issuesBySeriesGcd.get(seriesGcdId);
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("gcd_issues")
          .select("gcd_id, issue_number")
          .eq("series_gcd_id", seriesGcdId)
          .order("gcd_id")
          .range(from, from + 999);
        if (error) throw new Error(`issue list for series ${seriesGcdId}: ${error.code ?? "?"} ${error.message}`);
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      issuesBySeriesGcd.set(seriesGcdId, all);
      return all;
    }

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const rowNumber = i + 2; // +2 accounts for header row

      try {
        // Normalize keys
        const row = {};
        Object.keys(rawRow).forEach((key) => {
          row[key.toLowerCase().trim()] = rawRow[key];
        });

        const series_title = String(row.series_title || "").trim();
        const issue_number = String(row.issue_number || "").trim();
        const publisher_name = String(row.publisher || "").trim();
        const release_year = row.release_year
          ? Number(row.release_year)
          : null;
        const status =
          row.status && row.status.toLowerCase() === "wishlist"
            ? "wishlist"
            : "owned";

        if (!series_title || !issue_number || !publisher_name) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            message: "Missing required field(s)",
          });
          continue;
        }

        const duplicateKey = `${series_title.toLowerCase()}|${issue_number}|${publisher_name.toLowerCase()}`;

        if (seenRows.has(duplicateKey)) {
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            message: "Duplicate entry inside CSV file",
          });
          continue;
        }

        seenRows.add(duplicateKey);

        // 1. Resolve the series against the real catalog.
        //
        // Nothing is created here. The previous version looked the
        // publisher up by exact name and the series by exact title, both
        // with .maybeSingle(), and destructured only `data` — so a
        // different publisher spelling and a title with more than one
        // volume BOTH silently took the "not found" branch and inserted
        // duplicates. See src/lib/csvImport/matchRow.js.
        const candidates = seriesByTitle.get(normalizeKey(series_title)) ?? [];
        const decision = chooseSeries(candidates, {
          releaseYear: release_year,
          publisher: publisher_name,
        });

        // Last narrowing before giving up: which of the tied volumes
        // actually contains this issue number? Two different runs called
        // "Rai" both start in 2014 (16 issues and 4), so a year cannot
        // separate them — but only one of them has issue #12. If exactly
        // one candidate has the issue, that is evidence rather than a
        // guess. If several do, it stays ambiguous.
        let resolved = decision;
        if (decision.status === "ambiguous") {
          const holders = [];
          for (const candidate of decision.candidates) {
            const issue = matchIssue(await issuesFor(candidate.gcd_id), issue_number);
            if (issue) holders.push({ candidate, issue });
          }
          if (holders.length === 1) {
            resolved = { status: "matched", series: holders[0].candidate };
          }
        }

        if (resolved.status === "ambiguous") {
          results.ambiguous++;
          results.skipped++;
          results.errors.push({
            row: rowNumber,
            message: ambiguityMessage(series_title, resolved.candidates),
          });
          continue;
        }

        if (resolved.status === "matched") {
          const issue = matchIssue(await issuesFor(resolved.series.gcd_id), issue_number);
          if (!issue) {
            results.skipped++;
            results.errors.push({
              row: rowNumber,
              message:
                `Found "${resolved.series.title}" (${resolved.series.year_start_cached}) ` +
                `but it has no issue #${issue_number}.`,
            });
            continue;
          }

          // Catalog-linked rows carry gcd_issue_id and NO comic_id; local
          // rows are the reverse. Verified against the live table: 677 rows
          // have gcd_issue_id with comic_id null, and zero have both. This
          // is what makes covers, values and run completion light up.
          const { data: already, error: dupErr } = await supabase
            .from("user_collections")
            .select("id")
            .eq("user_id", user_id)
            .eq("gcd_issue_id", issue.gcd_id)
            .limit(1);
          if (dupErr) throw new Error(`duplicate check: ${dupErr.code ?? "?"} ${dupErr.message}`);
          if (already && already.length > 0) {
            results.skipped++;
            continue;
          }

          const { error: linkErr } = await supabase
            .from("user_collections")
            .insert({ user_id, gcd_issue_id: issue.gcd_id, status });
          if (linkErr) throw new Error(`attach: ${linkErr.code ?? "?"} ${linkErr.message}`);

          results.attached++;
          results.matchedToCatalog++;
          continue;
        }

        // 2. status === "none": the catalog genuinely has no series by this
        // title. Falling back to a local entry keeps the escape hatch for
        // books we do not carry, which is a real case — but it is now
        // reached only when there was nothing to match, never because a
        // lookup errored and got swallowed.
        let { data: publisher, error: pubErr } = await supabase
          .from("publishers")
          .select("id, name")
          .eq("name", publisher_name)
          .limit(1);
        if (pubErr) throw new Error(`publisher lookup: ${pubErr.code ?? "?"} ${pubErr.message}`);
        publisher = publisher?.[0] ?? null;

        if (!publisher) {
          const { data, error } = await supabase
            .from("publishers")
            .insert({ name: publisher_name })
            .select()
            .maybeSingle();
          if (error) throw error;
          publisher = data;
        }

        const { data: localSeriesRows, error: lsErr } = await supabase
          .from("series")
          .select("id")
          .eq("title", series_title)
          .eq("publisher_id", publisher.id)
          .limit(1);
        if (lsErr) throw new Error(`local series lookup: ${lsErr.code ?? "?"} ${lsErr.message}`);
        let series = localSeriesRows?.[0] ?? null;

        if (!series) {
          const { data, error } = await supabase
            .from("series")
            .insert({ title: series_title, publisher_id: publisher.id })
            .select()
            .maybeSingle();
          if (error) throw error;
          series = data;
        }

        const { data: comicRows, error: cErr } = await supabase
          .from("comics")
          .select("id")
          .eq("series_id", series.id)
          .eq("issue_number", issue_number)
          .limit(1);
        if (cErr) throw new Error(`local comic lookup: ${cErr.code ?? "?"} ${cErr.message}`);
        let comic = comicRows?.[0] ?? null;

        if (!comic) {
          const { data, error } = await supabase
            .from("comics")
            .insert({
              series_id: series.id,
              issue_number,
              release_year,
              created_by: user_id,
            })
            .select()
            .maybeSingle();
          if (error) throw error;
          comic = data;
          results.created++;
        } else {
          results.reused++;
        }

        // 3. Attach the local entry to the collection (idempotent).
        // Same shape rule as above, inverted: a local row carries comic_id
        // and no gcd_issue_id.
        const { data: existingRows, error: existErr } = await supabase
          .from("user_collections")
          .select("id")
          .eq("user_id", user_id)
          .eq("comic_id", comic.id)
          .limit(1);
        if (existErr) throw new Error(`duplicate check: ${existErr.code ?? "?"} ${existErr.message}`);
        const existing = existingRows?.[0] ?? null;

        if (existing) {
          results.skipped++;
          continue;
        }

        const { error: attachError } = await supabase
          .from("user_collections")
          .insert({
            user_id,
            comic_id: comic.id,
            status,
          });

        if (attachError) throw attachError;

        results.attached++;
      } catch (err) {
        results.skipped++;
        results.errors.push({
          row: rowNumber,
          message: err.message || "Unexpected processing error",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("CSV import crashed:", err);
    return NextResponse.json(
      { error: "CSV import failed" },
      { status: 500 }
    );
  }
}