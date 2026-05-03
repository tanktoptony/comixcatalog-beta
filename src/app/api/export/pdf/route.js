import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import { ADMIN_ID } from "@/lib/admin";

export const maxDuration = 60;

const NAVY   = rgb(0.043, 0.118, 0.420);
const GOLD   = rgb(0.957, 0.816, 0.247);
const WHITE  = rgb(1, 1, 1);
const OFF    = rgb(0.97, 0.97, 0.99);
const DGRAY  = rgb(0.18, 0.18, 0.18);
const MGRAY  = rgb(0.55, 0.55, 0.55);
const LGRAY  = rgb(0.88, 0.88, 0.90);
const PGRAY  = rgb(0.92, 0.92, 0.94);

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseYear(val) {
  const m = String(val || "").match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function condAbbrev(cond) {
  if (!cond) return null;
  const m = String(cond).match(/\((\w+)\)/);
  return m ? m[1] : cond.split(" ")[0];
}

async function fetchImageBytes(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    const isPng = ct.includes("png") || url.toLowerCase().endsWith(".png");
    return { bytes, isPng };
  } catch {
    return null;
  }
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncate(text, font, size, maxWidth) {
  let s = String(text || "");
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 0 && font.widthOfTextAtSize(s + "…", size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function gradeColor(g) {
  if (g == null) return MGRAY;
  if (g >= 9.6) return GOLD;
  if (g >= 9.0) return rgb(0.18, 0.75, 0.40);
  if (g >= 7.0) return rgb(0.20, 0.48, 0.88);
  if (g >= 4.0) return rgb(0.88, 0.50, 0.12);
  return rgb(0.78, 0.18, 0.18);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { user_id } = body;
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = getSupabase();

    const [{ data: profile }, { data: collRows, error: collErr }] = await Promise.all([
      supabase.from("profiles").select("username, is_pro").eq("id", user_id).single(),
      supabase
        .from("user_collections")
        .select("id, comic_id, gcd_issue_id, condition, grade_numeric, slab_company, slab_cert_number, notes, purchase_price, market_value, user_cover_url")
        .eq("user_id", user_id)
        .eq("status", "owned"),
    ]);

    const isProOrAdmin = Boolean(profile?.is_pro) || user_id === ADMIN_ID;
    if (!isProOrAdmin) {
      return NextResponse.json(
        { error: "Pro tier required", upgrade: true },
        { status: 402 }
      );
    }

    if (collErr) {
      console.error("PDF export: user_collections query failed", {
        message: collErr.message,
        details: collErr.details,
        hint: collErr.hint,
        code: collErr.code,
      });
      return NextResponse.json(
        { error: `Failed to fetch collection: ${collErr.message}` },
        { status: 500 }
      );
    }
    if (!collRows?.length) {
      return NextResponse.json({ error: "No owned comics in collection" }, { status: 404 });
    }

    const username = profile?.username || "Collector";
    const comicMeta = {};

    // ── Local comics ──
    const localIds = collRows.filter((r) => r.comic_id).map((r) => r.comic_id);
    if (localIds.length > 0) {
      const { data: comics } = await supabase
        .from("comics")
        .select("id, series_title, publisher, issue_number, release_year, comic_covers(image_path, is_primary)")
        .in("id", localIds);

      for (const c of comics || []) {
        const path = c.comic_covers?.find((x) => x.is_primary)?.image_path ?? null;
        comicMeta[`comic:${c.id}`] = {
          title: c.series_title ?? "Untitled",
          issueNumber: c.issue_number ?? "",
          publisher: c.publisher ?? "Unknown",
          year: c.release_year ?? null,
          coverUrl: path
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${path}`
            : null,
        };
      }
    }

    // ── GCD issues ──
    const gcdIds = collRows.filter((r) => r.gcd_issue_id).map((r) => r.gcd_issue_id);
    if (gcdIds.length > 0) {
      const { data: issues } = await supabase
        .from("gcd_issues")
        .select("gcd_id, issue_number, publication_date, series_gcd_id, title")
        .in("gcd_id", gcdIds);

      const seriesGcdIds = [...new Set((issues || []).map((i) => i.series_gcd_id).filter(Boolean))];
      const { data: seriesRows } = seriesGcdIds.length
        ? await supabase
            .from("series")
            .select("gcd_id, title, publisher:publisher_id(id, name)")
            .in("gcd_id", seriesGcdIds)
        : { data: [] };

      const seriesMap = {};
      for (const s of seriesRows || []) seriesMap[s.gcd_id] = s;

      const gcdWithMeta = (issues || []).map((issue) => {
        const series = seriesMap[issue.series_gcd_id];
        return {
          gcd_id: issue.gcd_id,
          issueNumber: issue.issue_number ?? "",
          seriesTitle: series?.title ?? issue.title ?? "Untitled",
          publisher: series?.publisher?.name ?? null,
          year: parseYear(issue.publication_date),
        };
      });

      // Batch canonical cover lookup
      const uniqueTitles = [...new Set(gcdWithMeta.map((i) => i.seriesTitle))];
      const { data: canonRows } = uniqueTitles.length
        ? await supabase
            .from("canonical_covers")
            .select("series_title, issue_number, storage_path")
            .in("series_title", uniqueTitles)
            .not("storage_path", "is", null)
        : { data: [] };

      const canonMap = {};
      for (const row of canonRows || []) {
        canonMap[`${row.series_title}::${row.issue_number}`] = row.storage_path;
      }

      for (const item of gcdWithMeta) {
        const sp = canonMap[`${item.seriesTitle}::${item.issueNumber}`] ?? null;
        comicMeta[`gcd:${item.gcd_id}`] = {
          title: item.seriesTitle,
          issueNumber: item.issueNumber,
          publisher: item.publisher ?? "Unknown",
          year: item.year,
          coverUrl: sp
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${sp}`
            : null,
        };
      }
    }

    // ── Assemble sorted items ──
    const items = collRows
      .map((row) => {
        const key = row.comic_id ? `comic:${row.comic_id}` : `gcd:${row.gcd_issue_id}`;
        const meta = comicMeta[key] ?? {};
        return {
          ...row,
          title: meta.title ?? "Untitled",
          issueNumber: meta.issueNumber ?? "",
          publisher: meta.publisher ?? "Unknown",
          year: meta.year ?? null,
          // Prefer the collector's own photo — it's their specific copy.
          coverUrl: row.user_cover_url || meta.coverUrl || null,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    // ── Pre-fetch cover images in parallel ──
    const imgCache = {};
    await Promise.all(
      [...new Set(items.map((i) => i.coverUrl).filter(Boolean))].map(async (url) => {
        const data = await fetchImageBytes(url);
        if (data) imgCache[url] = data;
      })
    );

    // ── Build PDF ──
    const doc = await PDFDocument.create();
    const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg    = await doc.embedFont(StandardFonts.Helvetica);
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const [W, H] = PageSizes.Letter;
    const MARGIN = 36;

    // ── Cover page ──
    const cover = doc.addPage(PageSizes.Letter);
    cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
    cover.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GOLD });

    cover.drawText("COMIXCATALOG", { x: MARGIN + 18, y: H - 130, size: 44, font: bold, color: GOLD });
    cover.drawText("Collection Appraisal Report", { x: MARGIN + 18, y: H - 162, size: 18, font: reg, color: WHITE });
    cover.drawRectangle({ x: MARGIN + 18, y: H - 178, width: W - (MARGIN + 18) * 2, height: 2, color: GOLD });

    function sumColumn(rows, col) {
      const valid = rows.filter(
        (r) => r[col] != null && !Number.isNaN(Number(r[col]))
      );
      const total = valid.reduce((acc, r) => acc + Number(r[col]), 0);
      return { total, count: valid.length };
    }
    function money(n) {
      return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    function buildFinancialField(label, col) {
      const { total, count } = sumColumn(collRows, col);
      const value = count > 0 ? money(total) : "Not recorded";
      const caption = count > 0 && count < items.length
        ? `Based on ${count} of ${items.length} books`
        : null;
      return [label, value, caption];
    }

    const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const fields = [
      ["COLLECTOR", username],
      ["REPORT DATE", reportDate],
      ["TOTAL BOOKS", String(items.length)],
      buildFinancialField("TOTAL PAID", "purchase_price"),
      buildFinancialField("TOTAL MARKET VALUE", "market_value"),
    ];

    let fy = H - 220;
    for (const [label, value, caption] of fields) {
      cover.drawText(label, { x: MARGIN + 18, y: fy, size: 8, font: bold, color: GOLD, opacity: 0.75 });
      cover.drawText(value, { x: MARGIN + 18, y: fy - 18, size: 17, font: bold, color: WHITE });
      if (caption) {
        cover.drawText(caption, {
          x: MARGIN + 18, y: fy - 32, size: 7.5, font: italic, color: WHITE, opacity: 0.55,
        });
      }
      fy -= 48;
    }

    cover.drawRectangle({ x: MARGIN + 18, y: fy - 8, width: W - (MARGIN + 18) * 2, height: 1, color: GOLD, opacity: 0.3 });

    const disclaimer = "This report is generated for insurance and collection appraisal purposes only. Purchase-price and market-value totals reflect self-reported figures entered by the collector and do not constitute a formal written appraisal.";
    const dLines = wrapText(disclaimer, reg, 8.5, W - (MARGIN + 18) * 2);
    let dy = fy - 28;
    for (const line of dLines) {
      cover.drawText(line, { x: MARGIN + 18, y: dy, size: 8.5, font: italic, color: WHITE, opacity: 0.45 });
      dy -= 13;
    }

    cover.drawText(`Generated by ComixCatalog  ·  ${reportDate}`, {
      x: MARGIN + 18, y: 28, size: 8, font: reg, color: WHITE, opacity: 0.35,
    });

    // ── Table pages ──
    const HDR_H  = 28;
    const ROW_H  = 58;
    const IMG_W  = 38;
    const PAGE_CONTENT_TOP = H - 6 - HDR_H;  // bottom of header bar
    const PAGE_BOTTOM      = MARGIN;

    // Column x positions (0-indexed from left margin)
    // Total usable: 612 - 2*36 = 540
    const CX = {
      cover : MARGIN,
      title : MARGIN + 38,
      issue : MARGIN + 166,
      pub   : MARGIN + 192,
      year  : MARGIN + 264,
      grade : MARGIN + 294,
      slab  : MARGIN + 336,
      cert  : MARGIN + 378,
      paid  : MARGIN + 428,
      value : MARGIN + 476,
    };
    const CW = {
      cover : 38,
      title : 128,
      issue : 26,
      pub   : 72,
      year  : 30,
      grade : 42,
      slab  : 42,
      cert  : 50,
      paid  : 48,
      value : W - MARGIN - 476 - 2,
    };

    let page = null;
    let pageY = 0;
    let tablePageNum = 0;

    function newTablePage() {
      tablePageNum++;
      page = doc.addPage(PageSizes.Letter);

      // White background
      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE });

      // Gold top accent + navy header bar
      page.drawRectangle({ x: 0, y: H - 6,       width: W, height: 6,     color: GOLD });
      page.drawRectangle({ x: 0, y: H - 6 - HDR_H, width: W, height: HDR_H, color: NAVY });

      // Column headers
      const headers = [
        ["", CX.cover],
        ["TITLE", CX.title],
        ["#", CX.issue],
        ["PUBLISHER", CX.pub],
        ["YEAR", CX.year],
        ["GRADE", CX.grade],
        ["SLAB", CX.slab],
        ["CERT #", CX.cert],
        ["PAID", CX.paid],
        ["VALUE", CX.value],
      ];
      for (const [txt, x] of headers) {
        if (txt) {
          page.drawText(txt, {
            x: x + 2, y: H - 6 - HDR_H + 9,
            size: 7, font: bold, color: GOLD,
          });
        }
      }

      // Page number (written at bottom)
      page.drawText(`Page ${tablePageNum}`, {
        x: W / 2 - 16, y: 14,
        size: 8, font: reg, color: MGRAY,
      });

      pageY = PAGE_CONTENT_TOP;
    }

    newTablePage();

    for (const item of items) {
      if (pageY - ROW_H < PAGE_BOTTOM) {
        newTablePage();
      }

      const rowTop    = pageY;
      const rowBottom = pageY - ROW_H;

      // Row background (alternating)
      const rowBg = (tablePageNum + Math.floor((PAGE_CONTENT_TOP - rowTop) / ROW_H)) % 2 === 0
        ? WHITE
        : OFF;
      page.drawRectangle({ x: 0, y: rowBottom, width: W, height: ROW_H, color: rowBg });
      // Bottom rule
      page.drawRectangle({ x: 0, y: rowBottom, width: W, height: 0.5, color: LGRAY });

      // ── Cover image ──
      const ip = 3;
      const imgX = CX.cover + ip;
      const imgY = rowBottom + ip;
      const imgH = ROW_H - ip * 2;
      const imgWmax = IMG_W;

      const imgData = item.coverUrl && imgCache[item.coverUrl];
      if (imgData) {
        try {
          const embedded = imgData.isPng
            ? await doc.embedPng(imgData.bytes)
            : await doc.embedJpg(imgData.bytes);
          const dims = embedded.scaleToFit(imgWmax, imgH);
          page.drawImage(embedded, {
            x: imgX + (imgWmax - dims.width) / 2,
            y: imgY + (imgH - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
        } catch {
          page.drawRectangle({ x: imgX, y: imgY, width: imgWmax, height: imgH, color: PGRAY });
        }
      } else {
        page.drawRectangle({ x: imgX, y: imgY, width: imgWmax, height: imgH, color: PGRAY });
      }

      // Row text vertical center
      const ty = rowBottom + ROW_H / 2 - 3;
      const ts = 7.5;

      // Title
      page.drawText(truncate(item.title, bold, ts, CW.title - 4), {
        x: CX.title + 2, y: ty + 4, size: ts, font: bold, color: DGRAY,
      });
      // Issue
      if (item.issueNumber) {
        page.drawText(truncate(`#${item.issueNumber}`, reg, ts, CW.issue - 2), {
          x: CX.issue, y: ty + 4, size: ts, font: reg, color: DGRAY,
        });
      }
      // Publisher
      page.drawText(truncate(item.publisher || "—", reg, ts, CW.pub - 4), {
        x: CX.pub, y: ty + 4, size: ts, font: reg, color: DGRAY,
      });
      // Year
      page.drawText(item.year ? String(item.year) : "—", {
        x: CX.year, y: ty + 4, size: ts, font: reg, color: DGRAY,
      });

      // Grade badge
      let gradeLabel = "—";
      let gc = MGRAY;
      if (item.grade_numeric != null) {
        gradeLabel = String(item.grade_numeric);
        gc = gradeColor(item.grade_numeric);
      } else if (item.condition) {
        gradeLabel = condAbbrev(item.condition) ?? "—";
      }
      const glW = Math.max(bold.widthOfTextAtSize(gradeLabel, ts) + 10, 20);
      page.drawRectangle({
        x: CX.grade, y: ty, width: glW, height: 13,
        color: gc, opacity: 0.12,
        borderColor: gc, borderWidth: 0.8, borderOpacity: 0.7,
      });
      page.drawText(gradeLabel, {
        x: CX.grade + 5, y: ty + 3, size: ts, font: bold, color: gc,
      });

      // Slab
      page.drawText(truncate(item.slab_company || "—", reg, ts, CW.slab - 4), {
        x: CX.slab, y: ty + 4, size: ts, font: reg, color: DGRAY,
      });

      // Cert
      page.drawText(truncate(item.slab_cert_number || "—", reg, ts, CW.cert - 4), {
        x: CX.cert, y: ty + 4, size: ts, font: reg, color: DGRAY,
      });

      // Paid
      const paidLabel = item.purchase_price != null && !Number.isNaN(Number(item.purchase_price))
        ? money(Number(item.purchase_price))
        : "—";
      page.drawText(truncate(paidLabel, reg, ts, CW.paid - 4), {
        x: CX.paid, y: ty + 4, size: ts, font: reg, color: DGRAY,
      });

      // Market value
      const valueLabel = item.market_value != null && !Number.isNaN(Number(item.market_value))
        ? money(Number(item.market_value))
        : "—";
      const valueHasNumber = valueLabel !== "—";
      page.drawText(truncate(valueLabel, bold, ts, CW.value - 4), {
        x: CX.value, y: ty + 4, size: ts, font: bold, color: valueHasNumber ? NAVY : MGRAY,
      });

      pageY -= ROW_H;
    }

    // ── Totals row ──
    const TOTALS_H = 36;
    if (pageY - TOTALS_H < PAGE_BOTTOM) {
      newTablePage();
    }

    const totalsTop    = pageY;
    const totalsBottom = pageY - TOTALS_H;

    // Thicker separator above totals
    page.drawRectangle({
      x: MARGIN, y: totalsTop - 1, width: W - MARGIN * 2, height: 1.2, color: NAVY,
    });
    page.drawRectangle({
      x: 0, y: totalsBottom, width: W, height: TOTALS_H, color: OFF,
    });

    const tRowY = totalsBottom + TOTALS_H / 2 - 3;
    const totalPaidAll    = sumColumn(items, "purchase_price").total;
    const totalValueAll   = sumColumn(items, "market_value").total;

    page.drawText("TOTAL", {
      x: CX.cert, y: tRowY + 4, size: 8.5, font: bold, color: NAVY,
    });
    page.drawText(money(totalPaidAll), {
      x: CX.paid, y: tRowY + 4, size: 8.5, font: bold, color: NAVY,
    });
    page.drawText(money(totalValueAll), {
      x: CX.value, y: tRowY + 4, size: 9, font: bold, color: NAVY,
    });

    pageY -= TOTALS_H;

    // ── Return PDF ──
    const bytes = await doc.save();
    const filename = `comixcatalog-collection-${new Date().toISOString().split("T")[0]}.pdf`;

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
