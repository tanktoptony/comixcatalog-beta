"use client";

// Internal video-production asset retriever. Paste a list of books, check the
// covers the catalog resolves, download them as a ZIP of real image files plus
// manifest.json. Gated like /admin: ADMIN_ID client-side for the redirect, with
// the real check in the API routes. No nav entry.
//
// The ZIP is assembled here in the browser from one validated file per request
// (see /api/admin/production-assets/asset for why).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zipSync, strToU8 } from "fflate";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";
import { sniffImage, uniqueFilename } from "@/lib/productionAssets";

const EPISODE_001 = `Uncanny X-Men #1 (1963)
Uncanny X-Men #129
Uncanny X-Men #130
Uncanny X-Men #135
Uncanny X-Men #136
Uncanny X-Men #137
Uncanny X-Men #141
Uncanny X-Men #142
Uncanny X-Men #266
X-Men #14 (1991 series)
X-Men #15
X-Men #16
House of M #1
House of M #8
House of X #1
House of X #6
Powers of X #1
Powers of X #6`;

const ROOT = "comixcatalog-video-assets";

function span(c) {
  if (!c?.yearStart) return "year unknown";
  return c.yearEnd && c.yearEnd !== c.yearStart ? `${c.yearStart}-${c.yearEnd}` : String(c.yearStart);
}

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function ProductionAssetsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [episode, setEpisode] = useState("Episode 001: Where to Start Reading X-Men Without Losing Your Mind");
  const [text, setText] = useState(EPISODE_001);
  const [results, setResults] = useState([]);
  // Per-row choices, keyed by result index: { include, picked (issueId) }.
  const [choices, setChoices] = useState({});
  const [resolving, setResolving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.id !== ADMIN_ID) router.replace("/");
  }, [user, loading, router]);

  // The book a row currently stands for: its match, or the candidate picked
  // for an ambiguous row.
  function effectiveMatch(row) {
    const picked = choices[row.index]?.picked;
    if (picked) return row.candidates.find((c) => c.issueId === picked) ?? null;
    return row.status === "matched" ? row.match : null;
  }

  function isIncluded(row) {
    const m = effectiveMatch(row);
    return !!m?.cover && !!choices[row.index]?.include;
  }

  const selectedCount = useMemo(
    () => results.filter((r) => isIncluded(r)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, choices]
  );

  async function resolve() {
    setResolving(true);
    setError(null);
    setReport(null);
    setResults([]);
    setChoices({});
    try {
      const res = await authedFetch("/api/admin/production-assets/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Resolve failed (${res.status})`);
      setResults(json.results);
      const initial = {};
      for (const r of json.results) {
        initial[r.index] = { include: r.status === "matched" && !!r.match?.cover, picked: null };
      }
      setChoices(initial);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  function setChoice(index, patch) {
    setChoices((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  function setAll(include) {
    setChoices((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (effectiveMatch(r)?.cover) next[r.index] = { ...next[r.index], include };
      }
      return next;
    });
  }

  async function download() {
    setDownloading(true);
    setError(null);
    setReport(null);
    const used = new Set();
    const files = {};
    const assets = [];
    const todo = results.filter((r) => isIncluded(r));
    let done = 0;
    setProgress({ done, total: todo.length });

    // Fetch in order, a few at a time.
    const fetched = new Map();
    let cursor = 0;
    const worker = async () => {
      while (cursor < todo.length) {
        const row = todo[cursor++];
        const match = effectiveMatch(row);
        try {
          const res = await authedFetch(
            `/api/admin/production-assets/asset?issueId=${encodeURIComponent(match.issueId)}`
          );
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || `HTTP ${res.status}`);
          }
          const meta = JSON.parse(decodeURIComponent(res.headers.get("X-Asset-Meta") || "%7B%7D"));
          const bytes = new Uint8Array(await res.arrayBuffer());
          // Belt and braces: the route validated, but check what actually
          // arrived before it goes in the ZIP.
          const sniffed = sniffImage(bytes);
          if (!bytes.length) throw new Error("Empty response body");
          if (!sniffed) throw new Error("Response is not an image");
          if (meta.bytes && meta.bytes !== bytes.length) {
            throw new Error(`Size mismatch (expected ${meta.bytes}, got ${bytes.length})`);
          }
          fetched.set(row.index, { ok: true, meta, bytes, ext: sniffed.ext });
        } catch (err) {
          fetched.set(row.index, { ok: false, error: err.message });
        }
        done += 1;
        setProgress({ done, total: todo.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    for (const row of results) {
      const match = effectiveMatch(row);
      const base = {
        requested: row.requested,
        series: match?.seriesTitle ?? null,
        issue: match?.issueNumber ?? null,
        year: match?.year ?? null,
        publisher: match?.publisher ?? null,
        comicId: match?.issueId ?? null,
        seriesId: match?.seriesId ?? null,
        seriesGcdId: match?.seriesGcdId ?? null,
        filename: null,
        coverSource: null,
        originalCoverUrl: null,
        storagePath: match?.storagePath ?? null,
        matchStatus: choices[row.index]?.picked ? "picked" : row.status,
        matchConfidence: choices[row.index]?.picked ? "manual" : row.confidence,
        notes: row.notes,
      };
      const got = fetched.get(row.index);
      if (got?.ok) {
        const name = uniqueFilename(got.meta.filenameBase, got.ext, used);
        files[`${ROOT}/covers/${name}`] = [got.bytes, { level: 0 }];
        assets.push({
          ...base,
          series: got.meta.series ?? base.series,
          issue: got.meta.issue ?? base.issue,
          year: got.meta.year ?? base.year,
          publisher: got.meta.publisher ?? base.publisher,
          filename: `covers/${name}`,
          coverSource: got.meta.coverSource,
          originalCoverUrl: got.meta.originalCoverUrl,
          storagePath: got.meta.storagePath,
          canonicalCoverId: got.meta.canonicalCoverId,
          contentType: got.meta.contentType,
          bytes: got.bytes.length,
          status: "downloaded",
        });
      } else if (got) {
        assets.push({ ...base, status: "download_failed", error: got.error });
      } else if (!match) {
        assets.push({ ...base, status: row.status === "ambiguous" ? "ambiguous_unresolved" : row.status });
      } else if (!match.cover) {
        assets.push({ ...base, status: "no_cover" });
      } else {
        assets.push({ ...base, status: "excluded" });
      }
    }

    const counts = assets.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
    const manifest = { episode, generatedAt: new Date().toISOString(), counts, assets };
    files[`${ROOT}/manifest.json`] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];

    const downloaded = assets.filter((a) => a.status === "downloaded");
    if (downloaded.length) {
      const zipped = zipSync(files);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ROOT}-${slug(episode).slice(0, 40) || "pack"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      setError("Nothing downloaded, so no ZIP was produced.");
    }
    setReport({ counts, failures: assets.filter((a) => a.status === "download_failed"), bytes: downloaded.reduce((s, a) => s + a.bytes, 0) });
    setProgress(null);
    setDownloading(false);
  }

  if (loading || !user || user.id !== ADMIN_ID) {
    return <main className="admin-shell"><p>Loading…</p></main>;
  }

  const counts = results.reduce((acc, r) => {
    const key = r.status === "matched" && !r.match?.cover ? "no cover" : r.status;
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});

  return (
    <main className="admin-shell admin-shell-wide">
      <header className="admin-header">
        <p className="admin-kicker">Admin Tools</p>
        <h1 className="admin-title">Production assets</h1>
        <p className="admin-lede">Paste one book per line. Get the covers the catalog shows, as real image files.</p>
      </header>

      <section className="admin-card">
        <label className="pa-label" htmlFor="pa-episode">Episode</label>
        <input
          id="pa-episode"
          className="admin-input pa-episode"
          value={episode}
          onChange={(e) => setEpisode(e.target.value)}
        />
        <label className="pa-label" htmlFor="pa-lines">
          Books, one per line: <code>Title #issue (year)</code>. A year carries down to later lines with the same title.
        </label>
        <textarea
          id="pa-lines"
          className="admin-input pa-textarea"
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={resolve} disabled={resolving || !text.trim()}>
            {resolving ? "Resolving…" : "Resolve Covers"}
          </button>
        </div>
        {error && <p className="admin-message err">{error}</p>}
      </section>

      {results.length > 0 && (
        <section className="admin-card">
          <div className="pa-toolbar">
            <div className="pa-counts">
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} className={`pa-status pa-status-${slug(k)}`}>{v} {k}</span>
              ))}
            </div>
            <div className="pa-toolbar-actions">
              <button type="button" className="admin-btn" onClick={() => setAll(true)}>Select all</button>
              <button type="button" className="admin-btn" onClick={() => setAll(false)}>Select none</button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={download}
                disabled={downloading || selectedCount === 0}
              >
                {downloading && progress
                  ? `Downloading ${progress.done}/${progress.total}…`
                  : `Download Asset Pack (${selectedCount})`}
              </button>
            </div>
          </div>

          {report && (
            <div className={`admin-message ${report.failures.length ? "err" : "ok"}`}>
              ZIP built: {report.counts.downloaded ?? 0} covers, {(report.bytes / 1024 / 1024).toFixed(1)} MB.
              {" "}{Object.entries(report.counts).filter(([k]) => k !== "downloaded").map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")}
              {report.failures.map((f) => (
                <div key={f.requested}>Failed: {f.requested} ({f.error})</div>
              ))}
            </div>
          )}

          <div className="pa-table-wrap">
            <table className="pa-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Cover</th>
                  <th>Requested</th>
                  <th>Matched series</th>
                  <th>#</th>
                  <th>Year</th>
                  <th>Publisher</th>
                  <th>Status</th>
                  <th>Storage path</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const m = effectiveMatch(row);
                  const picked = !!choices[row.index]?.picked;
                  const statusKey = picked
                    ? "picked"
                    : row.status === "matched" && !m?.cover
                      ? "no cover"
                      : row.status === "matched" && row.confidence === "inferred"
                        ? "check"
                        : row.status;
                  return [
                    <tr key={`r${row.index}`} className={isIncluded(row) ? "" : "pa-row-off"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isIncluded(row)}
                          disabled={!m?.cover}
                          onChange={(e) => setChoice(row.index, { include: e.target.checked })}
                          aria-label={`Include ${row.requested}`}
                        />
                      </td>
                      <td>
                        {m?.cover
                          ? <img className="pa-thumb" src={m.cover} alt={`${m.seriesTitle} #${m.issueNumber}`} loading="lazy" />
                          : <div className="pa-thumb pa-thumb-empty">none</div>}
                      </td>
                      <td className="pa-requested">{row.requested}</td>
                      <td>
                        {m ? (
                          <>
                            <a href={`/issue/${m.issueId}`} target="_blank" rel="noreferrer">{m.seriesTitle}</a>
                            <div className="pa-sub">{span(m)} · {m.issueCount ?? "?"} issues</div>
                          </>
                        ) : "—"}
                      </td>
                      <td>{m?.issueNumber ?? row.parsed.issue ?? "—"}</td>
                      <td>{m?.year ?? "—"}</td>
                      <td>{m?.publisher ?? "—"}</td>
                      <td>
                        <span className={`pa-status pa-status-${slug(statusKey)}`}>{statusKey}</span>
                        {row.notes.map((n) => <div key={n} className="pa-note">{n}</div>)}
                      </td>
                      <td className="pa-mono">{m?.storagePath ?? "—"}</td>
                    </tr>,
                    row.status === "ambiguous" && (
                      <tr key={`c${row.index}`} className="pa-cand-row">
                        <td></td>
                        <td colSpan={8}>
                          <div className="pa-cands">
                            {row.candidates.map((c) => {
                              const on = choices[row.index]?.picked === c.issueId;
                              return (
                                <button
                                  type="button"
                                  key={c.issueId}
                                  className={`pa-cand ${on ? "on" : ""}`}
                                  onClick={() => setChoice(row.index, on ? { picked: null, include: false } : { picked: c.issueId, include: !!c.cover })}
                                >
                                  {c.cover
                                    ? <img className="pa-cand-thumb" src={c.cover} alt="" loading="lazy" />
                                    : <div className="pa-cand-thumb pa-thumb-empty">no cover</div>}
                                  <span className="pa-cand-title">{c.seriesTitle}</span>
                                  <span className="pa-sub">{span(c)} · {c.issueCount ?? "?"} issues</span>
                                  <span className="pa-sub">{c.publisher ?? "publisher unknown"} · #{c.issueNumber}{c.year ? ` (${c.year})` : ""}</span>
                                  {c.seriesFormat && <span className="pa-sub">{c.seriesFormat}</span>}
                                  <span className="pa-sub pa-mono">{c.issueId}{c.comicvineVolumeId ? ` · CV ${c.comicvineVolumeId}` : ""}</span>
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="admin-footnote">
        Covers are the same files the issue pages show, read from the <code>canonical-covers</code> bucket
        server-side. File extensions come from the image bytes. Every requested line, including
        ambiguous and missing ones, is listed in <code>manifest.json</code>.
      </p>
    </main>
  );
}
