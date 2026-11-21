"use client";

// "Which version is yours?" inside the library copy editor. Shows every
// version of the issue on file as cover tiles (regular, newsstand, later
// printings, cover variants); one tap moves the copy. A barcode read, from
// the camera or typed, picks the version for you, and when the barcode
// says the copy was saved as the wrong issue it offers to move it there.

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import { barcodeVerdict } from "@/lib/copyVersion";
import { normalizeUpc, upcProblem } from "@/lib/printings";
import { useBarcodeReader } from "@/components/useBarcodeReader";

// A version switch changes the library row's key (it includes the issue),
// so React mounts a fresh editor once the library reloads. This carries
// "it worked" across that remount: the new editor opens with the message.
const recentSwitches = new Map();
const RECENT_MS = 60_000;
export function hasRecentSwitch(collectionId) {
  const entry = recentSwitches.get(collectionId);
  return Boolean(entry && Date.now() - entry.at < RECENT_MS);
}
function takeRecentSwitch(collectionId) {
  const entry = recentSwitches.get(collectionId);
  recentSwitches.delete(collectionId);
  return entry && Date.now() - entry.at < RECENT_MS ? entry.message : null;
}

const issueName = (row) => `${row.series_title}${row.issue_number ? ` #${row.issue_number}` : ""}${row.year ? ` (${row.year})` : ""}`;

function CameraPanel({ onUpc, onClose }) {
  const { videoRef, cameraState } = useBarcodeReader({ active: true, onUpc });
  const problem = cameraState === "denied"
    ? "Camera access is off for this site. Allow it in your browser settings, or type the barcode below."
    : cameraState === "unavailable"
      ? "No camera here. Type the numbers under the bars instead."
      : null;
  return (
    <div className="copy-version-camera">
      {problem ? <p className="copy-version-note">{problem}</p> : (
        <div className="copy-version-viewfinder">
          <video ref={videoRef} muted playsInline aria-label="Barcode camera" />
          <div className="copy-version-frame" aria-hidden="true" />
          <p>{cameraState === "ready" ? "Fit the barcode and the small 5-digit block in the box" : "Starting camera..."}</p>
        </div>
      )}
      <button type="button" className="copy-version-link" onClick={onClose}>Close camera</button>
    </div>
  );
}

export default function CopyVersionPicker({ collectionId, gcdIssueId, onSwitched }) {
  const [currentId, setCurrentId] = useState(Number(gcdIssueId) || null);
  const [syncedProp, setSyncedProp] = useState(Number(gcdIssueId) || null);
  if (syncedProp !== (Number(gcdIssueId) || null)) {
    setSyncedProp(Number(gcdIssueId) || null);
    setCurrentId(Number(gcdIssueId) || null);
  }
  const [versions, setVersions] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(() => takeRecentSwitch(collectionId));
  const [camera, setCamera] = useState(false);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState(null);

  useEffect(() => {
    if (!currentId) return undefined;
    let cancelled = false;
    fetch(`/api/collection/version?gcd_issue_id=${currentId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load versions.");
        if (!cancelled) { setVersions(data.versions ?? []); setLoadError(null); }
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [currentId]);

  const familyIds = useMemo(() => (versions ?? []).map((version) => version.gcdId), [versions]);
  const current = versions?.find((version) => version.gcdId === currentId) ?? null;
  const highlighted = new Set(
    verdict?.kind === "version" ? [Number(verdict.target.gcd_issue_id)]
      : verdict?.kind === "pick-version" ? verdict.candidates.map((row) => Number(row.gcd_issue_id)) : []
  );
  const nameFor = (gcdId) => versions?.find((version) => version.gcdId === Number(gcdId))?.name ?? "that version";

  async function switchTo(targetId, via, label) {
    if (!collectionId || !targetId || busyId) return;
    setBusyId(targetId);
    setError(null);
    setDone(null);
    try {
      const response = await authedFetch("/api/collection/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: collectionId, gcd_issue_id: targetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change this copy.");
      const crossIssue = !familyIds.includes(Number(targetId));
      trackEvent("library_version_switch", { via, cross_issue: crossIssue });
      setCurrentId(Number(targetId));
      if (crossIssue) setVersions(null);
      setVerdict(null);
      setShowAll(false);
      const message = crossIssue ? `Saved. Moved to ${label}.` : `Saved. Your copy is now the ${label}.`;
      setDone(message);
      recentSwitches.set(collectionId, { message, at: Date.now() });
      onSwitched?.(data.item, { crossIssue });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const lookUp = useCallback(async (rawUpc) => {
    const upc = normalizeUpc(rawUpc);
    const problem = upcProblem(upc);
    if (!upc || problem) { setError(problem || "Type the numbers under the bars."); return; }
    setCamera(false);
    setChecking(true);
    setError(null);
    setDone(null);
    setVerdict(null);
    try {
      const response = await authedFetch("/api/printings/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upc }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check that barcode.");
      const result = barcodeVerdict({ upc: data.upc ?? upc, matched: data.matched, candidates: data.candidates, familyIds, currentGcdId: currentId });
      trackEvent("library_version_barcode", { kind: result.kind });
      setVerdict({ ...result, upc: data.upc ?? upc });
      if (result.kind === "pick-version") setShowAll(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }, [familyIds, currentId]);

  const hasChoices = (versions?.length ?? 0) > 1;
  const tiles = showAll ? versions ?? [] : [];

  return (
    <div className="grade-field copy-version">
      <label className="grade-label">Version</label>

      <div className="copy-version-current">
        {current?.cover
          ? <img src={current.cover} alt="" className="copy-version-current-cover" />
          : <div className="copy-version-current-cover copy-version-nocover" aria-hidden="true">No cover</div>}
        <div className="copy-version-current-text">
          <strong>{versions ? current?.name ?? "This issue" : loadError ? "Version unknown" : "Loading..."}</strong>
          <small>
            {loadError ? loadError
              : !versions ? "Checking which versions are on file"
                : hasChoices ? `${versions.length} versions on file` : "Only one version on file"}
          </small>
        </div>
      </div>

      <div className="copy-version-actions">
        {hasChoices && (
          <button type="button" className="grade-cover-btn" onClick={() => setShowAll((open) => !open)} aria-expanded={showAll}>
            {showAll ? "Hide versions" : "Change version"}
          </button>
        )}
        <button type="button" className="grade-cover-btn" onClick={() => { setCamera((open) => !open); setVerdict(null); setError(null); }} disabled={checking}>
          {camera ? "Cancel scan" : "Scan barcode"}
        </button>
      </div>

      {camera && <CameraPanel onUpc={lookUp} onClose={() => setCamera(false)} />}

      <form className="copy-version-type" onSubmit={(event) => { event.preventDefault(); lookUp(typed); }}>
        <input
          className="grade-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Or type the barcode digits"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-label="Barcode digits"
        />
        <button type="submit" className="grade-cover-btn" disabled={checking || !typed.trim()}>{checking ? "Checking..." : "Look up"}</button>
      </form>

      {verdict && (
        <div className="copy-version-verdict" role="status">
          {verdict.kind === "same" && <p>That barcode is the {nameFor(verdict.target.gcd_issue_id)}, which is already what this copy is saved as.</p>}
          {verdict.kind === "version" && (
            <>
              <p>That barcode is the <strong>{nameFor(verdict.target.gcd_issue_id)}</strong>.</p>
              <button type="button" className="grade-save-btn" disabled={Boolean(busyId)} onClick={() => switchTo(Number(verdict.target.gcd_issue_id), "barcode", nameFor(verdict.target.gcd_issue_id))}>
                {busyId ? "Saving..." : `Switch to ${nameFor(verdict.target.gcd_issue_id)}`}
              </button>
            </>
          )}
          {verdict.kind === "pick-version" && <p>The camera caught the main barcode but not the small 5-digit block beside it, so it fits {verdict.candidates.length} versions. They are outlined below. Tap yours.</p>}
          {verdict.kind === "other-issue" && (
            <div className="copy-version-other">
              {verdict.target.cover_path && <img src={verdict.target.cover_path} alt="" />}
              <div>
                <p>That barcode is <strong>{issueName(verdict.target)}</strong>, not this issue.</p>
                <button type="button" className="grade-save-btn" disabled={Boolean(busyId)} onClick={() => switchTo(Number(verdict.target.gcd_issue_id), "barcode-issue", issueName(verdict.target))}>
                  {busyId ? "Moving..." : "Move my copy there"}
                </button>
              </div>
            </div>
          )}
          {verdict.kind === "pick-issue" && (
            <>
              <p>{verdict.withAddOn
                ? "That barcode is printed on more than one issue. Pick yours:"
                : "Only the main barcode came through, and every issue in this run shares it. Scan again with the small 5-digit block in the frame, or pick the issue:"}</p>
              <div className="copy-version-issue-list">
                {verdict.candidates.map((row) => (
                  <button key={row.gcd_issue_id} type="button" disabled={Boolean(busyId)} onClick={() => switchTo(Number(row.gcd_issue_id), "barcode-issue", issueName(row))}>
                    {issueName(row)}
                  </button>
                ))}
              </div>
            </>
          )}
          {verdict.kind === "unknown" && <p>We don&apos;t have that barcode on file yet.{hasChoices ? " Pick your version from the covers instead." : ""}</p>}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="copy-version-grid" role="list">
          {tiles.map((version) => {
            const isCurrent = version.gcdId === currentId;
            return (
              <button
                key={version.gcdId}
                type="button"
                role="listitem"
                className={`copy-version-tile${isCurrent ? " is-current" : ""}${highlighted.has(version.gcdId) ? " is-match" : ""}`}
                disabled={isCurrent || Boolean(busyId)}
                onClick={() => switchTo(version.gcdId, "grid", version.name)}
                aria-label={isCurrent ? `${version.name}, your copy` : `Switch to ${version.name}`}
              >
                {version.cover
                  ? <img src={version.cover} alt="" loading="lazy" />
                  : <span className="copy-version-nocover">No cover yet</span>}
                <span className="copy-version-tile-name">{version.name}</span>
                {isCurrent && <span className="copy-version-tag">Yours</span>}
                {busyId === version.gcdId && <span className="copy-version-tag">Saving...</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="grade-error">{error}</div>}
      {done && <p className="copy-version-done" role="status">{done}</p>}
    </div>
  );
}
