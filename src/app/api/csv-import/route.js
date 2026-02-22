import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

export async function POST(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const user_id = formData.get("user_id");

    if (!file || !user_id) {
      return NextResponse.json(
        { error: "Missing file or user_id" },
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

    if (rows.length > 200) {
      return NextResponse.json(
        { error: "CSV exceeds 200 row limit" },
        { status: 400 }
      );
    }

    const results = {
      created: 0,
      reused: 0,
      attached: 0,
      skipped: 0,
      errors: [],
    };

    const seenRows = new Set();

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

        // 1️⃣ Publisher
        let { data: publisher } = await supabase
          .from("publishers")
          .select("*")
          .eq("name", publisher_name)
          .maybeSingle();

        if (!publisher) {
          const { data, error } = await supabase
            .from("publishers")
            .insert({ name: publisher_name })
            .select()
            .maybeSingle();

          if (error) throw error;
          publisher = data;
        }

        // 2️⃣ Series
        let { data: series } = await supabase
          .from("series")
          .select("*")
          .eq("title", series_title)
          .eq("publisher_id", publisher.id)
          .maybeSingle();

        if (!series) {
          const { data, error } = await supabase
            .from("series")
            .insert({
              title: series_title,
              publisher_id: publisher.id,
            })
            .select()
            .maybeSingle();

          if (error) throw error;
          series = data;
        }

        // 3️⃣ Comic
        let { data: comic } = await supabase
          .from("comics")
          .select("*")
          .eq("series_id", series.id)
          .eq("issue_number", issue_number)
          .maybeSingle();

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

        // 4️⃣ Attach to user collection (idempotent)
        const { data: existing } = await supabase
          .from("user_collections")
          .select("id")
          .eq("user_id", user_id)
          .eq("comic_id", comic.id)
          .maybeSingle();

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