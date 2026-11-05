"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { autoMapColumns, IMPORT_FIELDS, mapRow, pickSheet, splitBatches, splitBatchesBy, statusFromValue, tableFromGrid, wishlistFromFilename } from "@/lib/import/import";
import styles from "./switch.module.css";

const SOURCES = {
  clz: {
    name: "CLZ Comics", subtitle: "Export from CLZ Cloud", heading: "Get your file from CLZ",
    steps: ["On a computer, sign in to CLZ Cloud. Using the phone app? Sync to CLZ Cloud first.", "Open the menu at the top left and choose Export to CSV/TXT.", "Leave every field selected and click Export."],
  },
  league: {
    name: "League of Comic Geeks", subtitle: "Export your comics to Excel", heading: "Get your file from League",
    // Steps from League's help article "How can I export My Comics to Excel?"
    // (checked 2026-11-04). Its column names are not published.
    steps: ["On the League of Comic Geeks website, go to My Comics.", "Open the Comics menu at the top and choose Bulk Import/Export.", "Click Export My Comics at the bottom of the page, then drop the Excel file here. No converting needed."],
  },
  sheet: {
    name: "Any spreadsheet", subtitle: "A CSV with series and issue", heading: "Prepare your spreadsheet",
    steps: ["One row per comic. Columns for series and issue number are enough; publisher, year, grade and price help."],
  },
};

const FIELD_LABELS = { series: "Series", issue: "Issue", full_title: "Series + issue", publisher: "Publisher", year: "Year", variant: "Variant", grade: "Grade", slab_company: "Slab company", cert: "Cert number", price_paid: "Price paid", notes: "Notes", quantity: "Quantity", status: "Status", in_collection: "In collection", in_wishlist: "On wantlist" };
const chip = { matched: ["Matched", "good"], pick: ["Pick one", "warn"], not_found: ["Not found", "miss"] };

export default function SwitchImporter() {
  const { user, loading: authLoading } = useAuth();
  const inputRef = useRef(null);
  const [source, setSource] = useState("clz");
  const [screen, setScreen] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [defaultStatus, setDefaultStatus] = useState("owned");
  const [results, setResults] = useState([]);
  const [outcomes, setOutcomes] = useState({});
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryFrom, setRetryFrom] = useState(null);
  const [requested, setRequested] = useState(0);
  const [otherSheets, setOtherSheets] = useState([]);
  const rows = useMemo(() => rawRows.map((raw, i) => mapRow(raw, i, mapping)), [rawRows, mapping]);
  const leftOut = rows.filter((row) => row.skip).length;
  const fields = Object.values(mapping);
  const matchedColumns = fields.filter(Boolean).length;
  const hasRequired = fields.includes("full_title") || (fields.includes("series") && fields.includes("issue"));
  const fileSaysList = fields.includes("in_collection") || fields.includes("in_wishlist");
  const matchedResults = results.filter((result) => result.result === "matched");
  const matchedCopies = matchedResults.reduce((sum, result) => sum + Math.min(20, Math.max(1, Number(rows[result.i]?.quantity) || 1)), 0);

  function loadGrid(file, grid, others = []) {
    const table = tableFromGrid(grid);
    if (!table.headers.length || !table.rows.length) return setError("That file has no rows to import.");
    setFileName(file.name);
    setHeaders(table.headers);
    setRawRows(table.rows);
    setMapping(autoMapColumns(table.headers, table.rows));
    setOtherSheets(others);
    setResults([]);
    setOutcomes({});
    setDefaultStatus(wishlistFromFilename(file.name) ? "wishlist" : "owned");
    setScreen(2);
  }

  async function readFile(file) {
    setError("");
    if (file && /\.(xls|numbers)$/i.test(file.name)) return setError("We can't read that spreadsheet format yet. Save it as .xlsx or CSV, then drop it here.");
    if (file && /\.xlsx$/i.test(file.name)) {
      try {
        // Loaded on demand: most imports are CSV, and this page shouldn't carry
        // the Excel reader for them.
        const { default: readWorkbook } = await import("read-excel-file/browser");
        const { sheet, others } = pickSheet(await readWorkbook(file));
        return loadGrid(file, sheet?.data ?? [], others);
      } catch { return setError("We could not read that Excel file. Save it as CSV and try again."); }
    }
    if (!file || !/\.(csv|txt)$/i.test(file.name)) return setError("Choose an Excel, CSV or TXT file.");
    Papa.parse(file, {
      skipEmptyLines: "greedy", delimiter: "",
      complete(parsed) { loadGrid(file, parsed.data ?? []); },
      error() { setError("We could not read that file. Save it as CSV or tab-delimited TXT and try again."); },
    });
  }

  async function resolveRows(startBatch = 0) {
    if (!hasRequired) return setError("Map a series column and an issue column, or one column holding both, to continue.");
    setBusy(true);
    setError("");
    const batches = splitBatches(rows.filter((row) => !row.skip));
    const merged = startBatch ? results.slice() : [];
    try {
      for (let index = startBatch; index < batches.length; index += 1) {
        const response = await authedFetch("/api/import/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: batches[index].map(({ i, series, issue, publisher, series_year, issue_year }) => ({ i, series, issue, publisher, series_year, issue_year })) }) });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not match this batch.");
        merged.push(...json.rows);
        setResults([...merged].sort((a, b) => a.i - b.i));
        setProgress(Math.round(((index + 1) / batches.length) * 100));
      }
      setRetryFrom(null);
    } catch (caught) {
      setRetryFrom(Math.floor(merged.length / 200));
      setError(`${caught.message} The books already matched are safe. Retry the rest.`);
    } finally { setBusy(false); }
  }

  async function commit(importResults = matchedResults, picked = false) {
    setBusy(true);
    setError("");
    const payload = importResults.map((result) => ({ ...rows[result.i], gcd_issue_id: result.gcd_issue_id, status: statusFromValue(rows[result.i]?.status, defaultStatus) }));
    const nextOutcomes = { ...outcomes };
    try {
      for (const batch of splitBatchesBy(payload, (row) => row.gcd_issue_id)) {
        const response = await authedFetch("/api/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: defaultStatus, rows: batch }) });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not save this batch.");
        for (const item of json.rows) nextOutcomes[item.i] = picked && item.outcome === "imported" ? "picked" : item.outcome;
        setOutcomes({ ...nextOutcomes });
      }
      setScreen(3);
    } catch (caught) { setError(`${caught.message} Earlier batches are saved.`); }
    finally { setBusy(false); }
  }

  async function pickVolume(group, seriesId) {
    setBusy(true);
    setError("");
    try {
      const pickRows = group.map((result) => ({ i: result.i, series: rows[result.i].series, issue: rows[result.i].issue, series_gcd_id: Number(seriesId) }));
      const resolved = [];
      for (const batch of splitBatches(pickRows)) {
        const response = await authedFetch("/api/import/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: batch }) });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        resolved.push(...json.rows);
      }
      await commit(resolved.filter((result) => result.result === "matched"), true);
      setResults((current) => current.map((result) => resolved.find((item) => item.i === result.i) ?? result));
    } catch (caught) { setError(caught.message || "Could not import those picks."); setBusy(false); }
  }

  async function requestMissing() {
    const distinct = [...new Map(results.filter((result) => result.result === "not_found").map((result) => {
      const row = rows[result.i];
      return [`${row.series}|${row.issue}|${row.publisher}|${row.year}`, row];
    })).values()].slice(0, 50);
    setBusy(true); setError("");
    let sent = 0;
    try {
      for (const row of distinct) {
        const response = await authedFetch("/api/catalog-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: row.series, issue_number: row.issue, publisher: row.publisher, year: row.year, source: "direct", notes: "Requested from Switch importer" }) });
        if (!response.ok) throw new Error((await response.json()).error || "Could not send a request.");
        sent += 1; setRequested(sent);
      }
    } catch (caught) { setError(`${caught.message} ${sent} request${sent === 1 ? " was" : "s were"} sent.`); }
    finally { setBusy(false); }
  }

  function downloadReport() {
    const report = rows.map((row) => {
      const result = results.find((item) => item.i === row.i);
      return { ...rawRows[row.i], result: row.skip ? "left out: not in collection or wantlist" : outcomes[row.i] === "skipped_existing" ? "skipped duplicate" : outcomes[row.i] === "picked" ? "picked" : outcomes[row.i] === "imported" ? "imported" : result?.result === "not_found" ? "not found" : "not imported", matched_series_issue: result?.label ?? "" };
    });
    const blob = new Blob([Papa.unparse(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `comixcatalog-import-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  const picks = Object.values(Object.groupBy?.(results.filter((result) => result.result === "pick"), (result) => rows[result.i]?.series) ?? results.filter((result) => result.result === "pick").reduce((groups, result) => { const key = rows[result.i]?.series; (groups[key] ||= []).push(result); return groups; }, {}));
  const importedCount = Object.entries(outcomes).reduce((sum, [i, outcome]) => ["imported", "picked"].includes(outcome) ? sum + Math.min(20, Math.max(1, Number(rows[i]?.quantity) || 1)) : sum, 0);
  const carried = rows.filter((row) => ["imported", "picked"].includes(outcomes[row.i]));

  return <main className={styles.main}>
    {screen === 1 && <section className={styles.screen}>
      <div className={styles.eyebrow}>Switch to ComixCatalog</div><h1>Bring your books. Skip the typing.</h1>
      <p className={styles.sub}>Export from the app you use now, drop the file here, and we match every book to our catalog. Grades, slabs and cert numbers come with it.</p>
      <div className={styles.apps}>{Object.entries(SOURCES).map(([key, item]) => <button key={key} className={`${styles.app} ${source === key ? styles.selected : ""}`} onClick={() => setSource(key)}><b>{item.name}</b><span>{item.subtitle}</span></button>)}</div>
      <div className={styles.two}><div className={styles.panel}><b>{SOURCES[source].heading}</b><ol className={styles.steps}>{SOURCES[source].steps.map((step) => <li key={step}>{step}</li>)}</ol></div>
        {!authLoading && !user ? <div className={styles.drop}><b>Ready to bring your books over?</b><Link className={styles.gold} href="/signup?next=/switch">Sign up free to import</Link><Link className={styles.ghost} href="/login?next=/switch">I have an account</Link></div> : <div className={styles.drop} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}><span className={styles.plus}>+</span><b>Drop your file here</b><small>or <button onClick={() => inputRef.current?.click()}>choose a file</button> · Excel, CSV or TXT · big collections are fine, we import in batches</small><input ref={inputRef} hidden type="file" accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain" onChange={(event) => readFile(event.target.files[0])} /></div>}
      </div>{error && <p className={styles.error}>{error}</p>}
    </section>}

    {screen === 2 && <section className={styles.screen}><h2>Check the columns</h2><p className={styles.sub}>We matched {matchedColumns} of your {headers.length} columns. Fix any guess, or leave it as is.</p>
      {fileSaysList
        ? <p className={styles.muted}>Your file says which list each book is on, so we&apos;ll follow it.{leftOut > 0 && ` ${leftOut} ${leftOut === 1 ? "book isn't" : "books aren't"} in your collection or wantlist, so ${leftOut === 1 ? "it stays" : "they stay"} out.`}</p>
        : <div className={styles.status}><b>These books are:</b><button className={defaultStatus === "owned" ? styles.active : ""} onClick={() => setDefaultStatus("owned")}>In my collection</button><button className={defaultStatus === "wishlist" ? styles.active : ""} onClick={() => setDefaultStatus("wishlist")}>On my wantlist</button></div>}
      {!fileSaysList && fields.includes("full_title") && <p className={styles.muted}>League files can mix collection, wish list and read list books. If a column below says which list a book is on, set it to In collection or On wantlist. Otherwise every book goes on the list you picked.</p>}
      {otherSheets.length > 0 && <p className={styles.muted}>We read the biggest sheet in your workbook and left out: {otherSheets.join(", ")}.</p>}
      {!hasRequired && <p className={styles.error}>We need a series column and an issue column, or one column holding both, like Batman #1. Set them below.</p>}
      <div className={styles.two}><div className={styles.panel}><div className={styles.mapHead}><b>Your column</b><b>Goes to</b><b>First row value</b></div>{headers.map((header) => <div className={styles.mapRow} key={header}><code>{header}</code><label><span className={styles.tick} aria-hidden="true">{mapping[header] ? "✓" : ""}</span><select value={mapping[header]} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })}><option value="">Don&apos;t import</option>{IMPORT_FIELDS.map((field) => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}</select></label><span>{String(rawRows[0]?.[header] ?? "")}</span></div>)}</div>
        <div className={styles.panel}><b>First books we found</b>{results.length > 0 && <small className={styles.summary}>{matchedResults.length} matched · {results.filter((item) => item.result === "pick").length} need a pick · {results.filter((item) => item.result === "not_found").length} not found</small>}{busy && <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>}{results.slice(0, 5).map((result) => <div className={styles.book} key={result.i}><div><b>{result.label || `${rows[result.i]?.series} #${rows[result.i]?.issue}`}</b><small>{result.reason || [rows[result.i]?.grade, rows[result.i]?.price_paid && `paid ${rows[result.i].price_paid}`].filter(Boolean).join(" · ")}</small></div><span className={`${styles.chip} ${styles[chip[result.result][1]]}`}>{chip[result.result][0]}</span></div>)}
          {!results.length && <p className={styles.muted}>Match the columns, then find your books.</p>}<div className={styles.actions}>{results.length ? <button disabled={busy || !matchedResults.length} className={styles.gold} onClick={() => commit()}>Import {matchedCopies} books</button> : <button disabled={busy || !hasRequired} className={styles.gold} onClick={() => resolveRows()}>Find my books</button>}<button className={styles.ghost} onClick={() => setScreen(1)}>Back</button></div>{retryFrom != null && <button className={styles.retry} onClick={() => resolveRows(retryFrom)}>Retry the rest</button>}</div></div>{error && <p className={styles.error}>{error}</p>}
    </section>}

    {screen === 3 && <section className={styles.screen}><div className={styles.big}>{importedCount} of {rows.filter((row) => !row.skip).reduce((sum, row) => sum + Math.min(20, Math.max(1, Number(row.quantity) || 1)), 0)}</div><h2>books are in. Welcome to ComixCatalog.</h2>
      <div className={styles.stats}><div className={styles.stat}><strong>{importedCount}</strong><p>Matched to the catalog. Covers, values and run tracking are on.</p><Link href="/library">See your collection →</Link></div><div className={styles.stat}><strong>{results.filter((item) => item.result === "pick").length}</strong><p>Need a pick. More than one volume shares the title, so you choose.</p></div><div className={styles.stat}><strong>{results.filter((item) => item.result === "not_found").length}</strong><p>Not in our catalog yet. Request them and we&apos;ll add them.</p></div></div>
      {picks.map((group) => <PickGroup key={rows[group[0].i]?.series} group={group} title={rows[group[0].i]?.series} busy={busy} onPick={pickVolume} />)}
      {results.some((item) => item.result === "not_found") && <div className={styles.panel}><h3>Not in our catalog yet</h3>{results.filter((item) => item.result === "not_found").slice(0, 50).map((item) => <p key={item.i}>{rows[item.i].series}{rows[item.i].issue ? ` #${rows[item.i].issue}` : ""}</p>)}<button disabled={busy} className={styles.gold} onClick={requestMissing}>Request them</button>{results.filter((item) => item.result === "not_found").length > 50 && <small>Up to 50 distinct books can be requested per click.</small>}{requested > 0 && <small>{requested} requested.</small>}</div>}
      <div className={styles.carried}><span>Came with them:</span><span><b>{carried.filter((row) => row.grade).length}</b> grades</span><span><b>{carried.filter((row) => row.slab_company && row.cert).length}</b> slabs with cert numbers</span><span><b>{carried.filter((row) => row.price_paid).length}</b> prices paid</span><span><b>{carried.filter((row) => row.variant).length}</b> variants</span></div><div className={styles.actions}><Link className={styles.gold} href="/library">See your collection</Link><button className={styles.ghost} onClick={downloadReport}>Download a report of this import</button></div>{error && <p className={styles.error}>{error}</p>}
    </section>}
  </main>;
}

function PickGroup({ group, title, busy, onPick }) {
  const [choice, setChoice] = useState("");
  const candidates = group[0]?.candidates ?? [];
  return <div className={styles.panel}><h3>{title}</h3>{candidates.map((candidate) => <label className={styles.radio} key={candidate.series_gcd_id}><input type="radio" name={`pick-${title}`} value={candidate.series_gcd_id} checked={String(choice) === String(candidate.series_gcd_id)} onChange={(event) => setChoice(event.target.value)} />{candidate.title} ({candidate.year_start || "year unknown"}) · {candidate.publisher || "Publisher unknown"} · {candidate.issue_count ?? "?"} issues</label>)}<button disabled={busy || !choice} className={styles.gold} onClick={() => onPick(group, choice)}>Import these</button></div>;
}
