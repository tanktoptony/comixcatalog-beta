"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { normalizeUpc, upcProblem } from "@/lib/printings";

// Contribute a comic — but check the catalog first.
//
// This page used to be a straight INSERT with no duplicate check that could
// work (see the comment in /api/catalog/lookup for the measurements), and on
// top of that it POSTed JSON to a handler that called req.formData(), so
// every submission returned 400 "Invalid form submission". Nothing was ever
// contributed through it.
//
// The catalog has 208,022 series. The overwhelmingly likely outcome of
// someone typing a title here is that we already have it, so the form now
// leads with that answer instead of with the submit button.

const LOOKUP_DEBOUNCE_MS = 350;

function volumeLabel(c) {
  const years =
    c.year_start && c.year_end && c.year_end !== c.year_start
      ? `${c.year_start}–${c.year_end}`
      : c.year_start || "year unknown";
  const issues = c.issue_count ? `${c.issue_count} issues` : null;
  return [years, c.publisher, issues].filter(Boolean).join(" · ");
}

export default function ContributeAddComicPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState({
    series_title: "",
    issue_number: "",
    publisher: "",
    release_year: "",
    variant_name: "",
  });

  const [lookup, setLookup] = useState({ state: "idle", candidates: [], status: null });

  // Set when someone looks at a match and says it is genuinely not their
  // book. Without an escape hatch the form would be unusable for the real
  // case it exists to serve: a variant or printing the catalog lacks.
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Guards against a slow early request landing after a fast later one and
  // overwriting good results with stale ones.
  const lookupSeq = useRef(0);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name !== "variant_name") setOverrideDuplicate(false);
  }

  const runLookup = useCallback(async (params) => {
    const seq = ++lookupSeq.current;
    const query = new URLSearchParams({
      title: params.series_title,
      issue: params.issue_number,
      year: params.release_year,
      publisher: params.publisher,
    });
    try {
      const res = await fetch(`/api/catalog/lookup?${query}`, { cache: "no-store" });
      const data = await res.json();
      if (seq !== lookupSeq.current) return;
      if (!res.ok || data.status === "error") {
        // A failed check must not read as "the catalog does not have it".
        setLookup({ state: "unavailable", candidates: [], status: null });
        return;
      }
      setLookup({
        state: "done",
        candidates: data.candidates ?? [],
        status: data.status ?? "none",
      });
    } catch {
      if (seq !== lookupSeq.current) return;
      setLookup({ state: "unavailable", candidates: [], status: null });
    }
  }, []);

  const { series_title, issue_number, release_year, publisher } = form;

  const titleReady = series_title.trim().length >= 2;

  useEffect(() => {
    if (!titleReady) {
      // Discard anything already in flight. Nothing is set here: a title too
      // short to search is handled by not rendering results at all, which
      // keeps this effect free of the synchronous setState that would make
      // every keystroke cascade a second render.
      lookupSeq.current++;
      return undefined;
    }
    const t = setTimeout(() => {
      setLookup((prev) => ({ ...prev, state: "loading" }));
      runLookup({ series_title, issue_number, release_year, publisher });
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [titleReady, series_title, issue_number, release_year, publisher, runLookup]);

  // Results belong to the title that produced them, so a title cleared back
  // below the threshold shows nothing rather than the previous answer.
  const shownLookup = titleReady ? lookup : { state: "idle", candidates: [], status: null };

  const haveIssue = shownLookup.state === "done" && shownLookup.status === "have_issue";
  const haveSeries = shownLookup.state === "done" && shownLookup.status === "have_series";
  const blocked = haveIssue && !overrideDuplicate;

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting || blocked) return;

    setSubmitting(true);
    setError(null);

    if (authLoading || !user?.id) {
      setError("Sign in to contribute a comic.");
      setSubmitting(false);
      return;
    }

    // FormData, because that is what /api/comics reads. This used to send
    // JSON, which made req.formData() throw and every submit fail with 400.
    const body = new FormData();
    body.append("series_title", form.series_title);
    body.append("issue_number", form.issue_number);
    body.append("publisher", form.publisher);
    if (form.release_year) body.append("release_year", form.release_year);
    if (form.variant_name) body.append("variant_name", form.variant_name);
    body.append("created_by", user.id);

    const res = await fetch("/api/comics", { method: "POST", body });

    let data = null;
    try {
      data = await res.json();
    } catch {
      setError("Server returned an invalid response.");
      setSubmitting(false);
      return;
    }

    if (!res.ok) {
      setError(data?.error || "Failed to add comic.");
      setSubmitting(false);
      return;
    }

    // The API may resolve the submission onto a catalog issue we already
    // hold rather than creating anything. Send them to the real book instead
    // of claiming a contribution that did not happen.
    if (data?.existing_issue?.href) {
      router.push(data.existing_issue.href);
      return;
    }

    setSuccess(true);
    setSubmitting(false);

    if (data?.comic?.id) {
      router.push(`/comic/${data.comic.id}`);
    } else {
      setForm({
        series_title: "",
        issue_number: "",
        publisher: "",
        release_year: "",
        variant_name: "",
      });
    }
  }

  return (
    <main className="page">
      <section className="cc-form-card">
        <h1 className="cc-form-title">Contribute a comic</h1>
        <p className="cc-form-sub">
          Help fill gaps in the database. Start typing a series title and we
          check whether the catalog already has it &mdash; most of the time it
          does, and then what you want is{" "}
          <a href="/library">your library</a>, not this form.
        </p>

        <form onSubmit={handleSubmit} className="cc-form">
          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="cc-series">Series title</label>
              <input
                id="cc-series"
                name="series_title"
                className="cc-input"
                placeholder="Amazing Spider-Man"
                value={form.series_title}
                onChange={handleChange}
                autoComplete="off"
                required
              />
            </div>

            <div className="cc-field">
              <label htmlFor="cc-issue">Issue number</label>
              <input
                id="cc-issue"
                name="issue_number"
                className="cc-input"
                placeholder="300"
                value={form.issue_number}
                onChange={handleChange}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <CatalogMatches
            lookup={shownLookup}
            issueNumber={form.issue_number.trim()}
            blocked={blocked}
            overridden={overrideDuplicate}
            onOverride={() => setOverrideDuplicate(true)}
          />

          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="cc-publisher">Publisher</label>
              <input
                id="cc-publisher"
                name="publisher"
                className="cc-input"
                placeholder="Marvel Comics"
                value={form.publisher}
                onChange={handleChange}
                required
              />
            </div>

            <div className="cc-field">
              <label htmlFor="cc-year">Release year</label>
              <input
                id="cc-year"
                name="release_year"
                className="cc-input"
                type="number"
                placeholder="1988"
                value={form.release_year}
                onChange={handleChange}
              />
              <span className="cc-hint">
                Narrows the search when several volumes share a title.
              </span>
            </div>
          </div>

          <div className="cc-field">
            <label htmlFor="cc-variant">Variant name</label>
            <input
              id="cc-variant"
              name="variant_name"
              className="cc-input"
              placeholder="Cover B, Newsstand, Director's Cut, etc."
              value={form.variant_name}
              onChange={handleChange}
            />
            <span className="cc-hint">Leave blank for the standard cover.</span>
          </div>

          {error && <div className="cc-form-error">{error}</div>}
          {success && (
            <div
              className="cc-form-error"
              style={{
                background: "rgba(74,222,128,0.1)",
                borderColor: "rgba(74,222,128,0.4)",
                color: "#86efac",
              }}
            >
              Comic added. Thanks for contributing.
            </div>
          )}

          <div className="cc-form-actions">
            <button className="cc-submit" disabled={submitting || blocked}>
              {submitting ? "Submitting…" : "Submit comic"}
            </button>
            {blocked && (
              <span className="cc-hint" style={{ marginLeft: 12 }}>
                We already have this issue. Open it above, or tell us it is a
                different book to continue.
              </span>
            )}
            {haveSeries && (
              <span className="cc-hint" style={{ marginLeft: 12 }}>
                We have the series but not that issue. This is exactly the gap
                worth filling.
              </span>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

function CatalogMatches({ lookup, issueNumber, blocked, overridden, onOverride }) {
  if (lookup.state === "idle") return null;

  if (lookup.state === "loading") {
    return (
      <p className="cc-hint" aria-live="polite">
        Checking the catalog&hellip;
      </p>
    );
  }

  if (lookup.state === "unavailable") {
    return (
      <p className="cc-hint" aria-live="polite">
        Could not check the catalog just now. You can still submit, but it may
        turn out to be a duplicate.
      </p>
    );
  }

  if (!lookup.candidates.length) {
    return (
      <p className="cc-hint" aria-live="polite">
        Nothing in the catalog matches that title. Go ahead and add it.
      </p>
    );
  }

  const withIssue = lookup.candidates.filter((c) => c.matching_issue);
  const shown = withIssue.length ? withIssue : lookup.candidates;

  let heading;
  if (withIssue.length === 1) {
    heading = "We already have this issue.";
  } else if (withIssue.length > 1) {
    heading = "We already have this issue, in more than one volume.";
  } else {
    const n = lookup.candidates.length;
    const what = n === 1 ? "this series" : `${n} series`;
    heading = issueNumber
      ? `We have ${what} with that title, but not issue #${issueNumber}.`
      : `We have ${what} with that title.`;
  }

  return (
    <div className="cc-catalog-matches" aria-live="polite">
      <p className="cc-catalog-matches-head">{heading}</p>

      <ul className="cc-catalog-match-list">
        {shown.map((c) => {
          const href = c.matching_issue ? c.matching_issue.href : c.series_href;
          return (
            <li key={c.series_id} className="cc-catalog-match">
              {c.cover ? (
                // Supabase storage host is not configured in next.config
                // images, so this is a plain img on purpose.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.cover} alt="" className="cc-catalog-match-cover" loading="lazy" />
              ) : (
                <span
                  className="cc-catalog-match-cover cc-catalog-match-cover--empty"
                  aria-hidden="true"
                />
              )}
              <span className="cc-catalog-match-body">
                <a href={href} className="cc-catalog-match-title">
                  {c.title}
                  {c.matching_issue ? ` #${c.matching_issue.issue_number}` : ""}
                </a>
                <span className="cc-catalog-match-meta">{volumeLabel(c)}</span>
              </span>
              <a href={href} className="cc-catalog-match-action">
                {c.matching_issue ? "Open issue" : "Open series"}
              </a>
            </li>
          );
        })}
      </ul>

      {/* The Discogs move. When we already hold the issue, the useful next
          step is not "stop", it is "tell us how yours differs" — a printing
          is a new Release under the same Master, not a duplicate. */}
      {withIssue.length === 1 && withIssue[0].matching_issue && (
        <ReportPrinting issue={withIssue[0]} />
      )}

      {blocked && (
        <button type="button" className="cc-catalog-match-override" onClick={onOverride}>
          None of these are my book &mdash; let me add it
        </button>
      )}
      {overridden && (
        <p className="cc-hint">
          Submitting as a new catalog entry. Fill in the variant name if this is
          an alternate cover or printing.
        </p>
      )}
    </div>
  );
}

// "We have the issue, but not your printing."
//
// Kept deliberately small: a name, a barcode, and a note. No image upload,
// because a photo needs storage, moderation and a review queue, and none of
// that is worth building before anyone has reported a single printing.
//
// The barcode is the point. It is the comics equivalent of the catalogue
// number Discogs dedupes on, and nothing in the catalog carried one before
// this — gcd_issues holds gcd_id, series_gcd_id, issue_number, title,
// publication_date, key_date and publisher_gcd_id.
function ReportPrinting({ issue }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const problem = upcProblem(upc);
  const canSend = Boolean(name.trim() || normalizeUpc(upc)) && !problem && state !== "sending";

  async function send() {
    if (!canSend) return;
    setState("sending");
    setError(null);
    try {
      const { authedFetch } = await import("@/lib/apiClient");
      const res = await authedFetch("/api/printings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcd_issue_id: issue.matching_issue.gcd_id,
          printing_name: name,
          upc,
          notes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not save that right now.");
        setState(null);
        return;
      }
      setState(data?.duplicate ? "duplicate" : "sent");
    } catch {
      setError("Could not reach the server.");
      setState(null);
    }
  }

  if (state === "sent" || state === "duplicate") {
    return (
      <p className="cc-hint" style={{ marginTop: 10 }}>
        {state === "duplicate"
          ? "You have already reported this printing. Nothing new was added."
          : "Thanks. Logged against " + issue.title + " #" + issue.matching_issue.issue_number + " for review."}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="cc-catalog-match-override"
        onClick={() => setOpen(true)}
        style={{ marginTop: 10 }}
      >
        I have a printing you don&rsquo;t list &mdash; newsstand, Cover B, 2nd print
      </button>
    );
  }

  return (
    <div className="cc-printing-form">
      <p className="cc-printing-head">
        Tell us about your copy of {issue.title} #{issue.matching_issue.issue_number}
      </p>

      <div className="cc-printing-row">
        <label htmlFor="cc-printing-name">Printing</label>
        <input
          id="cc-printing-name"
          className="cc-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Newsstand, Cover B, 2nd Print, 1:25 Incentive"
          maxLength={120}
        />
      </div>

      <div className="cc-printing-row">
        <label htmlFor="cc-printing-upc">Barcode</label>
        <input
          id="cc-printing-upc"
          className="cc-input"
          value={upc}
          onChange={(e) => setUpc(e.target.value)}
          placeholder="759606083120 00111"
          inputMode="numeric"
          autoComplete="off"
        />
        <span className="cc-hint">
          {problem ||
            "The long number on the back, plus the small 5-digit block beside it if there is one. That block is what separates two covers of the same issue."}
        </span>
      </div>

      <div className="cc-printing-row">
        <label htmlFor="cc-printing-notes">Anything else</label>
        <input
          id="cc-printing-notes"
          className="cc-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          maxLength={500}
        />
      </div>

      {error && <div className="cc-form-error">{error}</div>}

      <div className="cc-printing-actions">
        <button type="button" className="cc-submit" onClick={send} disabled={!canSend}>
          {state === "sending" ? "Sending…" : "Report this printing"}
        </button>
        <button type="button" className="cc-catalog-match-override" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
