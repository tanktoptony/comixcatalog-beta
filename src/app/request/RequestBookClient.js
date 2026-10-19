"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS = {
  open: "Open",
  added: "Added",
  already_there: "Already in the catalog",
  declined: "Declined",
};

export default function RequestBookClient() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => ({
    title: searchParams.get("title") || "",
    issue_number: searchParams.get("issue") || "",
    publisher: searchParams.get("publisher") || "",
    year: searchParams.get("year") || "",
    barcode: searchParams.get("barcode") || "",
    scan_id: searchParams.get("scan") || "",
    source: ["scan", "barcode", "search", "no_results"].includes(searchParams.get("from"))
      ? searchParams.get("from")
      : "direct",
    search_term: searchParams.get("q") || "",
    notes: "",
  }), [searchParams]);
  const [form, setForm] = useState(initial);
  const [photo, setPhoto] = useState(null);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function loadRequests() {
    if (!user) return;
    const response = await authedFetch("/api/catalog-requests");
    const data = await response.json();
    if (response.ok) setRequests(data.requests ?? []);
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    authedFetch("/api/catalog-requests")
      .then(async (response) => {
        const data = await response.json();
        if (!cancelled && response.ok) setRequests(data.requests ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, value);
    if (photo) body.append("photo", photo);
    try {
      const response = await authedFetch("/api/catalog-requests", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send your request.");
      setSent(true);
      await loadRequests();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
  const disabled = loading || !user;
  if (sent) {
    return (
      <section className="request-card request-success" role="status">
        <h2>Got it. It&apos;s in the queue.</h2>
        <div className="request-actions">
          <button
            type="button"
            className="scan-btn scan-btn-primary"
            onClick={() => {
              setSent(false);
              setPhoto(null);
              setForm({ ...initial, title: "", issue_number: "", publisher: "", year: "", notes: "" });
            }}
          >
            Request another
          </button>
          <Link href="/scan" className="scan-btn scan-btn-secondary">Back to scan</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <form className="request-card request-form" onSubmit={submit}>
        <fieldset disabled={disabled || busy}>
          <label>
            Title
            <input required maxLength={200} value={form.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <div className="request-form-row">
            <label>
              Issue #
              <input maxLength={20} value={form.issue_number} onChange={(event) => update("issue_number", event.target.value)} />
            </label>
            <label>
              Year
              <input inputMode="numeric" maxLength={4} value={form.year} onChange={(event) => update("year", event.target.value.replace(/\D/g, ""))} />
            </label>
          </div>
          <label>
            Publisher
            <input maxLength={120} value={form.publisher} onChange={(event) => update("publisher", event.target.value)} />
          </label>
          <label>
            Notes <span>Variant, printing, anything that helps</span>
            <textarea maxLength={1000} rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>
          {form.scan_id ? (
            <p className="request-photo-note">We&apos;ll attach your scan photo.</p>
          ) : (
            <label>
              Cover photo <span>Optional, JPEG, PNG, or WebP up to 8 MB</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
            </label>
          )}
        </fieldset>
        {error && <p className="cover-scan-error">{error}</p>}
        {user ? (
          <button className="scan-btn scan-btn-primary" disabled={busy}>
            {busy ? "Sending..." : "Send request"}
          </button>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(currentUrl)}`} className="scan-btn scan-btn-primary">
            Sign in to send a request
          </Link>
        )}
      </form>

      {user && (
        <section className="request-history">
          <h2>Your requests</h2>
          {requests.length ? (
            <ul>
              {requests.map((request) => (
                <li key={request.id}>
                  <div>
                    <strong>{request.title}{request.issue_number ? ` #${request.issue_number}` : ""}</strong>
                    <small>{[request.publisher, request.year].filter(Boolean).join(" · ")}</small>
                  </div>
                  {request.status === "added" && request.resolved_gcd_issue_id ? (
                    <Link className={`request-status is-${request.status}`} href={`/issue/gcd-${request.resolved_gcd_issue_id}`}>
                      {STATUS_LABELS[request.status]}
                    </Link>
                  ) : (
                    <span className={`request-status is-${request.status}`}>{STATUS_LABELS[request.status]}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No requests yet.</p>
          )}
        </section>
      )}
    </>
  );
}
