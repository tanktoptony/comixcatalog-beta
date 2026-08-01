import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

# Windows console defaults to cp1252, which crashes on any character outside
# Latin-1 (mojibake from prior bad ingests, em-dashes, smart quotes, accented
# publisher names). Force stdout/stderr to UTF-8 so the script never dies just
# because it tried to print a weird character.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

print("ENV LOADED:", os.path.exists(".env.local"))
print("CV KEY PRESENT:", bool(os.getenv("COMICVINE_API_KEY")))

COMICVINE_API_KEY = os.getenv("COMICVINE_API_KEY")
if not COMICVINE_API_KEY:
    raise RuntimeError("COMICVINE_API_KEY missing from environment or .env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "canonical-covers")
SUPABASE_TABLE = os.environ.get("SUPABASE_TABLE", "canonical_covers")

BASE_API = "https://comicvine.gamespot.com/api"
OUT_DIR = Path("comicvine_api_output")
CSV_PATH = OUT_DIR / "issues_uploaded.csv"

HEADERS = {
    "User-Agent": "ComixCatalog/1.0",
    "Accept": "application/json",
}


def _safe_error(error: Exception) -> str:
    """Prevent API credentials embedded in failed request URLs from reaching logs."""
    return re.sub(r"([?&]api_key=)[^&\s]+", r"\1[REDACTED]", str(error))


# ── Rate-limit budgeting ─────────────────────────────────────────────────
# ComicVine free-tier is 200 requests/resource/hour. Each volume costs at
# minimum 1 search + 1 detail + N issue pages. To stay safely under the
# rolling 200/hour window we:
#   1. Sleep ~VOL_SLEEP_SECONDS BETWEEN volumes (defaults 1.0s, ~60 vol/min).
#   2. Track total search/volume requests in REQUEST_BUDGET.
#   3. Exit cleanly when REQUEST_BUDGET is exhausted, BEFORE the next 420.
#   4. On HTTP 420, back off and retry (15/30/60/120s) — a 420 is usually a
#      velocity blip, not a spent budget. Only raise RateLimited if every
#      retry still 420s, in which case the outer loop bails cleanly.
class RateLimited(Exception):
    """Raised when ComicVine returns HTTP 420 Enhance Your Calm."""


REQUEST_COUNTER = {"search": 0, "volume": 0, "issues": 0}

TARGET_VOLUMES = [
    # --- Marvel: Bronze/Modern Keys & Popular Runs ---
    # When a name matches multiple ComicVine volumes (e.g. "X-Men Annual"
    # exists for 1970, 1992, 1995, 2000, 2007, 2018…), prefer setting
    # `volume_id` directly from the ComicVine URL — e.g.
    # https://comicvine.gamespot.com/x-men-annual/4050-22988/ → volume_id=22988.
    # This bypasses the name+year search and removes ambiguity.
    
]

LIMIT_TEST = None  # set to None for full run


def parse_cli() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Ingest ComicVine cover art into Supabase canonical_covers."
    )
    p.add_argument(
        "--targets",
        type=str,
        default=None,
        help=(
            "Path to a JSON file with a list of {name, publisher, year} entries. "
            "When omitted, falls back to the hardcoded TARGET_VOLUMES list."
        ),
    )
    p.add_argument(
        "--needs-volume-id-out",
        type=str,
        default="needs_volume_id.json",
        help=(
            "Path to a JSON file where targets that couldn't be auto-resolved "
            "(ambiguous match or publisher mismatch) are recorded, along with "
            "the candidate ComicVine volume IDs to choose from. Merges with any "
            "existing file (dedup by name+year) so runs accumulate. Resolve "
            "later by re-running with --volume-id."
        ),
    )
    p.add_argument(
        "--done-file",
        type=str,
        default=".ingest-done.json",
        help=(
            "Ledger of targets already fully processed (resolved + ingested). "
            "Targets in here are skipped BEFORE a search call is spent, so each "
            "re-run walks down the list instead of re-grinding the top. Updated "
            "as the run progresses (survives Ctrl-C). Delete it (or use "
            "--ignore-done) to force a full re-sweep."
        ),
    )
    p.add_argument(
        "--ignore-done",
        action="store_true",
        help="Ignore the --done-file ledger this run (re-process every target).",
    )
    p.add_argument(
        "--skip-existing",
        action="store_true",
        help=(
            "Before processing each volume, fetch already-uploaded covers from "
            "canonical_covers and skip issues whose storage_path is already set. "
            "Re-run is then ~free for fully-covered volumes."
        ),
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on issues per volume (debug only).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve and print matches without uploading images or writing database rows.",
    )
    p.add_argument(
        "--volume-id",
        type=str,
        default=None,
        help=(
            "Ingest a single ComicVine volume by ID. Accepts a raw integer "
            "(e.g. 22995) or a full ComicVine URL "
            "(e.g. https://comicvine.gamespot.com/x-men/4050-22995/). "
            "Bypasses TARGET_VOLUMES and --targets."
        ),
    )
    p.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help=(
            "Skip the y/N confirmation prompt that runs before --volume-id "
            "ingestion. Use only when you're certain the volume ID is correct."
        ),
    )
    p.add_argument(
        "--expect-publisher",
        type=str,
        default=None,
        help=(
            "Optional safety check for --volume-id: refuse to proceed unless "
            "the resolved volume's publisher matches this name (loose match — "
            "'Marvel' matches 'Marvel Comics'). Prevents Donald-Duck-shaped "
            "accidents."
        ),
    )
    p.add_argument(
        "--max-search-calls",
        type=int,
        default=180,
        help=(
            "Hard cap on ComicVine search+volume requests per run. ComicVine's "
            "free tier limits 200/hour; default 180 leaves headroom for the "
            "rolling window. Exits cleanly when hit so the next run resumes "
            "with --skip-existing."
        ),
    )
    p.add_argument(
        "--vol-sleep",
        type=float,
        default=1.0,
        help=(
            "Seconds to sleep between volumes. Adds to the existing 0.5s "
            "between issues. Default 1.0 keeps us under the rolling rate cap."
        ),
    )
    return p.parse_args()


def parse_volume_id(value: str) -> int | None:
    """Accept either a raw integer or a ComicVine URL/slug like
    'https://comicvine.gamespot.com/x-men/4050-22995/' → 22995."""
    if not value:
        return None
    s = str(value).strip()
    if s.isdigit():
        return int(s)
    m = re.search(r"4050-(\d+)", s)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(\d{3,})\b", s)
    if m:
        return int(m.group(1))
    return None


def load_targets_from_file(path: str) -> list[dict]:
    """Read a JSON list of target volumes. Each entry needs 'name'; year and
    publisher are optional but strongly recommended for disambiguation."""
    p = Path(path)
    if not p.exists():
        print(f"--targets file not found: {path}", file=sys.stderr)
        sys.exit(2)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"--targets file is not valid JSON: {e}", file=sys.stderr)
        sys.exit(2)
    if not isinstance(data, list):
        print("--targets JSON must be a list of objects.", file=sys.stderr)
        sys.exit(2)
    cleaned = []
    for entry in data:
        if not isinstance(entry, dict) or not entry.get("name"):
            continue
        cleaned.append(
            {
                "name": entry["name"],
                "publisher": entry.get("publisher"),
                "year": entry.get("year"),
                "volume_id": entry.get("volume_id"),
            }
        )
    return cleaned


def fetch_existing_storage_paths(comicvine_volume_id: int) -> set[str]:
    """Return the set of issue_number values already uploaded for this volume.
    Used by --skip-existing to avoid re-downloading covers we already have."""
    if not comicvine_volume_id:
        return set()
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }
    seen: set[str] = set()
    offset = 0
    page = 1000
    while True:
        resp = requests.get(
            url,
            headers=headers,
            params={
                "select": "issue_number,storage_path",
                "comicvine_volume_id": f"eq.{comicvine_volume_id}",
                "storage_path": "not.is.null",
                "limit": page,
                "offset": offset,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"  warning: existing-cover fetch returned {resp.status_code}; continuing without skip")
            return set()
        batch = resp.json()
        for r in batch:
            issue_num = r.get("issue_number")
            if issue_num is not None:
                seen.add(str(issue_num).strip().lower())
        if len(batch) < page:
            break
        offset += page
    return seen


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "item"


def cv_get(endpoint: str, params: dict) -> dict:
    # Count by endpoint family for budgeting. Issue-list pages are 100 issues
    # at a time so they're cheap relative to search/volume — but they still
    # count against the rolling 200/hour limit and we track them too.
    if endpoint.startswith("search"):
        REQUEST_COUNTER["search"] += 1
    elif endpoint.startswith("volume"):
        REQUEST_COUNTER["volume"] += 1
    elif endpoint.startswith("issues"):
        REQUEST_COUNTER["issues"] += 1

    full_params = {
        "api_key": COMICVINE_API_KEY,
        "format": "json",
        **params,
    }

    # ComicVine's HTTP 420 "Enhance Your Calm" is usually a VELOCITY signal
    # (requests too close together, or their backend being moody) — it clears
    # after a short pause and can fire even on a fresh hourly window. So a 420
    # is NOT proof the budget is spent. Back off and retry a few times; only if
    # every spaced retry still 420s do we treat it as a genuine cap and raise
    # RateLimited so the outer loop bails. This is what stops a single stray
    # 420 from aborting an otherwise-healthy run at call #22.
    backoffs = [15, 30, 60, 120]  # seconds between retries; len = max retries
    attempt = 0
    while True:
        resp = requests.get(
            f"{BASE_API}/{endpoint}",
            params=full_params,
            headers=HEADERS,
            timeout=60,
        )
        if resp.status_code != 420:
            break
        if attempt >= len(backoffs):
            raise RateLimited(
                f"ComicVine returned 420 (rate-limited) and stayed limited "
                f"through {len(backoffs)} backoff retries — window looks "
                f"genuinely exhausted. Calls so far: "
                f"search={REQUEST_COUNTER['search']}, "
                f"volume={REQUEST_COUNTER['volume']}, issues={REQUEST_COUNTER['issues']}."
            )
        wait = backoffs[attempt]
        attempt += 1
        print(
            f"  ⏳ ComicVine 420 (attempt {attempt}/{len(backoffs)}); "
            f"backing off {wait}s then retrying…"
        )
        time.sleep(wait)

    resp.raise_for_status()
    data = resp.json()
    if data.get("status_code") != 1:
        raise RuntimeError(f"Comic Vine API error: {data.get('error')}")
    return data


def _start_year_of(vol: dict) -> int | None:
    try:
        return int(vol.get("start_year") or 0) or None
    except (TypeError, ValueError):
        return None


def _norm_publisher(value: str | None) -> str:
    """Loose publisher comparison — strips suffixes like 'Comics',
    'Entertainment', 'Inc.', and non-alphanumerics. Lets 'Marvel Comics' match
    'Marvel', 'DC Comics' match 'DC', etc."""
    if not value:
        return ""
    s = value.strip().lower()
    s = re.sub(r"\b(comics|entertainment|publishing|inc\.?|llc|ltd|company|co\.?)\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def _norm_title(value: str | None) -> str:
    """Loose title comparison so a GCD title matches its ComicVine volume even
    when punctuation, spacing, or typography differs.

    History:
    - First version only stripped a leading 'the' and collapsed whitespace.
      That fixed GCD 'Flash' vs CV 'The Flash' but missed everything else.
    - Real-world failures observed:
        'Batman / Superman: Authority Special' (us) vs 'Batman/Superman: …' (CV)
        'Locke & Key' (us) vs 'Locke and Key' (CV)
        smart quotes vs straight, em-dashes vs hyphens, colons absent in one
    - So now we normalize aggressively: lowercase, strip leading 'the', map
      common typography to ASCII, expand '&' → 'and', then treat every
      non-alphanumeric run as a single space.

    The publisher gate (line ~528) and year disambiguation downstream still
    guard against the wrong volume slipping through under a looser title match.
    """
    s = (value or "").strip().lower()
    if s.startswith("the "):
        s = s[4:]
    # Map common typography → ASCII before nuking punctuation. Order matters:
    # '&' must expand to 'and' before we strip it.
    s = s.replace("&", " and ")
    s = re.sub(r"[‘’‚‛`]", "'", s)
    s = re.sub(r"[“”„‟]", '"', s)
    s = re.sub(r"[—–―]", "-", s)
    # Every run of non-alphanumeric → single space. This collapses
    # "Batman / Superman" and "Batman/Superman" to the same string and
    # makes ":" optional in subtitles.
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# --- Done-ledger: which targets we've already fully processed ---------------
# --skip-existing skips re-UPLOADING covers, but the target still costs a SEARCH
# call every run, so re-runs re-grind the top of the list and never reach the
# bottom. This ledger records targets we've already handled and lets the loop
# skip them BEFORE searching, so successive runs sweep down the list.
def _done_key(target: dict) -> str:
    return f"{target.get('name')}{target.get('publisher')}{target.get('year')}"


def _load_done(path: str) -> set:
    try:
        return set(json.loads(Path(path).read_text(encoding="utf-8")))
    except Exception:
        return set()


def _save_done(path: str, done: set) -> None:
    # Atomic write so a Ctrl-C mid-write can't corrupt the ledger.
    tmp = f"{path}.tmp"
    Path(tmp).write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


# Targets we refused to auto-resolve because the ComicVine match was ambiguous
# (multiple volumes) or the publisher didn't line up. These need a manual
# --volume-id, so instead of letting them scroll past in the terminal we record
# them — WITH the candidate volume IDs to pick from — and flush to a file at the
# end of the run. (A truly-not-found title with no ComicVine volume at all is
# NOT recorded here: there's no volume-id to disambiguate to.)
NEEDS_VOLUME_ID: list[dict] = []


def _slim_candidate(v: dict) -> dict:
    return {
        "id": v.get("id"),
        "name": v.get("name"),
        "publisher": (v.get("publisher") or {}).get("name"),
        "start_year": _start_year_of(v),
    }


def _record_needs_volume_id(name, publisher, year, reason, candidates):
    NEEDS_VOLUME_ID.append(
        {
            "name": name,
            "publisher": publisher,
            "year": year,
            "reason": reason,
            "candidates": [_slim_candidate(v) for v in candidates],
        }
    )
    # Track ambiguous failures separately so the caller knows NOT to mark
    # them done in the ledger. Without this, a target that fails because of
    # multiple candidates gets marked done permanently — and a later
    # matcher improvement (e.g. issue-count tiebreaker) can never retry it.
    AMBIGUOUS_THIS_RUN.add((name, publisher, year))


# Set populated by _record_needs_volume_id during the run. The main loop
# consults this after find_volume returns None to decide whether the failure
# was a "couldn't find anything" (mark done) or "ambiguous, fixable" (don't
# mark done, give the next run / next matcher a chance).
AMBIGUOUS_THIS_RUN: set[tuple] = set()


def write_needs_volume_id(path: str) -> None:
    """Merge NEEDS_VOLUME_ID into the file at `path`, dedup by (name, year),
    newest record wins. Keeps a running list across resumed runs."""
    existing: list[dict] = []
    fp = Path(path)
    if fp.exists():
        try:
            existing = json.loads(fp.read_text(encoding="utf-8")) or []
        except Exception:
            existing = []
    merged: dict[tuple, dict] = {}
    for rec in existing + NEEDS_VOLUME_ID:
        merged[(rec.get("name"), rec.get("year"))] = rec
    out = list(merged.values())
    fp.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"\nRecorded {len(NEEDS_VOLUME_ID)} target(s) needing a manual --volume-id "
        f"this run ({len(out)} total) → {path}"
    )


def _pick_by_issue_count(
    candidates: list[dict],
    name: str,
    year: int | None,
    publisher: str | None,
    near_year: bool = False,
) -> dict | None:
    """Tiebreaker for multiple same-year (or near-year) volumes: pick the
    one with the most issues.

    Rationale: when ComicVine catalogs e.g. "Spider-Boy" 2024 as multiple
    volumes — main ongoing, FCBD special, variant-cover edition — the main
    ongoing series has 10+ issues while the others have 1 each. Issue
    count is the most reliable mechanical signal for "this is the series
    you actually wanted." A 2-3× gap in issue counts is treated as a
    confident pick; a tied or near-tied count bails (returns None) so the
    user can still disambiguate manually for genuinely ambiguous cases
    like two competing ongoing runs from the same year.
    """
    annotated = []
    for v in candidates:
        n = v.get("count_of_issues")
        try:
            n = int(n) if n is not None else 0
        except (TypeError, ValueError):
            n = 0
        annotated.append((n, v))
    annotated.sort(key=lambda x: x[0], reverse=True)
    top_n = annotated[0][0]
    second_n = annotated[1][0] if len(annotated) > 1 else 0

    # Confident pick: top has clearly more issues than the runner-up.
    # Threshold = at least 2 more issues AND ≥ 2× the runner-up.
    if top_n >= second_n + 2 and (second_n == 0 or top_n >= 2 * second_n):
        chosen = annotated[0][1]
        proximity = "near" if near_year else "starting in"
        print(
            f"  ⚖ {len(candidates)} volumes match {name!r} {proximity} "
            f"{year}; picking id={chosen.get('id')} by issue count "
            f"(top={top_n}, runner-up={second_n})."
        )
        return chosen

    # Tied or near-tied issue counts — genuinely ambiguous. Surface to user.
    proximity = "near year" if near_year else "starting in"
    print(
        f"  ✗ {len(candidates)} ComicVine volumes match {name!r} {proximity} "
        f"{year}; issue counts too close to break the tie "
        f"(top={top_n}, runner-up={second_n}). Pass --volume-id."
    )
    return None


def find_volume(name: str, publisher: str | None = None, year: int | None = None) -> dict | None:
    """Resolve a ComicVine volume by (name, publisher, year). Hard-fails when
    the publisher constraint can't be satisfied — never falls through to a
    random first-result, which is how Editorial Televisa's Spanish reprints
    silently overwrote a Marvel run.

    For ambiguous cases (multiple Marvel volumes named 'Uncanny X-Men' starting
    in the same year), the caller should pass an explicit --volume-id."""
    data = cv_get(
        "search/",
        {
            "query": name,
            "resources": "volume",
            "field_list": "id,name,publisher,start_year,count_of_issues,api_detail_url",
            "limit": 20,
        },
    )
    results = data.get("results") or []

    target_pub = _norm_publisher(publisher)

    target_title = _norm_title(name)
    name_matches = [
        v for v in results if _norm_title(v.get("name")) == target_title
    ]
    pub_matches = [
        v
        for v in name_matches
        if not target_pub or _norm_publisher((v.get("publisher") or {}).get("name")) == target_pub
    ]

    # If the user specified a publisher and no name+publisher match exists,
    # refuse — better to skip than to upload a Spanish reprint as Marvel.
    if publisher and not pub_matches:
        observed_pubs: set[str] = set()
        for v in name_matches:
            pub_name = (v.get("publisher") or {}).get("name")
            if pub_name:
                observed_pubs.add(pub_name)
        observed_list = sorted(observed_pubs)
        print(
            f"  ✗ no ComicVine volume named {name!r} with publisher {publisher!r}; "
            f"observed publishers for this title: {observed_list or '(none)'}; "
            f"skipping. Pass --volume-id to disambiguate."
        )
        _record_needs_volume_id(name, publisher, year, "publisher_mismatch", name_matches)
        return None

    candidates = pub_matches if pub_matches else name_matches

    if year is not None and candidates:
        exact = [v for v in candidates if _start_year_of(v) == year]
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            # Pick the volume with the most issues. The "main" ongoing series
            # almost always has more issues than a one-shot, FCBD special,
            # variant-cover edition, or tie-in mini that ComicVine catalogs as
            # a separate volume in the same launch year. Previously we bailed
            # here, but for blockbuster Marvel/DC titles (Spider-Boy 2024,
            # Captain America 2023) that meant the user had to manually look
            # up volume_ids for the most predictable case in the dataset.
            chosen = _pick_by_issue_count(exact, name, year, publisher)
            if chosen is not None:
                return chosen
            _record_needs_volume_id(name, publisher, year, "multiple_same_start_year_tied", exact)
            return None

        near = []
        for v in candidates:
            sy = _start_year_of(v)
            if sy is not None and abs(sy - year) <= 1:
                near.append(v)
        if len(near) == 1:
            return near[0]
        if len(near) > 1:
            chosen = _pick_by_issue_count(near, name, year, publisher, near_year=True)
            if chosen is not None:
                return chosen
            _record_needs_volume_id(name, publisher, year, "multiple_near_year_tied", near)
            return None

    # Year unspecified or no near match — only return if there's exactly one
    # candidate left. Multiple → ambiguous → bail.
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        observed_years_set: set[int] = set()
        for v in candidates:
            sy = _start_year_of(v)
            if sy is not None:
                observed_years_set.add(sy)
        observed_years = sorted(observed_years_set)
        print(
            f"  ✗ {len(candidates)} ComicVine volumes named {name!r} "
            f"(start years: {observed_years}); refusing to guess. Pass --volume-id."
        )
        _record_needs_volume_id(name, publisher, year, "multiple_candidates", candidates)
        return None
    return None


def fetch_issues_for_volume(volume_id: int) -> list[dict]:
    offset = 0
    all_issues = []

    while True:
        data = cv_get(
            "issues/",
            {
                "filter": f"volume:{volume_id}",
                "sort": "issue_number:asc",
                "field_list": "id,name,issue_number,cover_date,store_date,image,description,volume,api_detail_url",
                "limit": 100,
                "offset": offset,
            },
        )
        results = data.get("results") or []
        all_issues.extend(results)

        number_returned = data.get("number_of_page_results", 0)
        total = data.get("number_of_total_results", 0)

        if len(all_issues) >= total or number_returned == 0:
            break

        offset += number_returned
        time.sleep(0.5)

    return all_issues


def download_image_bytes(url: str) -> bytes:
    resp = requests.get(url, headers=HEADERS, timeout=120)
    resp.raise_for_status()
    return resp.content


def guess_ext(url: str) -> str:
    url = url.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if ext in url:
            return ext
    return ".jpg"


def guess_content_type(ext: str) -> str:
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "image/jpeg"


def upload_to_supabase_storage(storage_path: str, content: bytes, content_type: str) -> None:
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    resp = requests.post(upload_url, headers=headers, data=content, timeout=120)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload failed: {resp.status_code} {resp.text}")


def _escape_ilike(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def update_series_cv_publisher(series_title: str | None, cv_publisher: str | None) -> None:
    if not series_title or not cv_publisher:
        return
    url = f"{SUPABASE_URL}/rest/v1/series"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        resp = requests.patch(
            url,
            headers=headers,
            params={"title": f"ilike.{_escape_ilike(series_title)}"},
            json={"cv_publisher": cv_publisher},
            timeout=30,
        )
        if resp.status_code not in (200, 204):
            print(f"  cv_publisher patch failed ({series_title!r}): {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  cv_publisher patch error ({series_title!r}): {e}")


# Cache for series_gcd_id lookups — same target shouldn't requery per issue.
_SERIES_GCD_ID_CACHE: dict[tuple, int | None] = {}
_GCD_ISSUES_BY_SERIES_CACHE: dict[int, list[dict]] = {}


def _base_issue_number(value: object) -> str | None:
    """Mirror src/lib/coverMatch.js; guarded by cover-match-cases.json."""
    match = re.match(r"^(\d+(?:\.\d+)?)", str(value or "").strip())
    return match.group(1) if match else None


def _normalize_cover_match_title(value: object) -> str:
    """Mirror normalizeTitle() in src/lib/coverMatch.js."""
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _resolve_series_gcd_id(
    target_name: str | None,
    cv_volume_name: str | None,
    year: int | None,
) -> int | None:
    """Find the gcd_series id for a target so canonical_covers can store it
    alongside the cover row. Joins downstream (library-hydrate etc.) prefer
    this integer over fragile series_title string matching.

    Strategy: try the target name first (came from our DB via the gap file,
    so the closest match). Fall back to the CV-returned volume name. When
    multiple series share the same title, prefer the one whose
    year_start_cached is closest to the target year.

    Returns None if no confident match — downstream code handles this by
    falling back to the legacy title-string join.
    """
    if not target_name and not cv_volume_name:
        return None
    key = (target_name, cv_volume_name, year)
    if key in _SERIES_GCD_ID_CACHE:
        return _SERIES_GCD_ID_CACHE[key]

    def _query(title: str) -> list[dict]:
        try:
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            }
            base_params = {
                "select": "gcd_id,title,year_start_cached",
                "gcd_id": "not.is.null",
                "limit": "100",
            }
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/series",
                headers=headers,
                params={**base_params, "title": f"eq.{title}"},
                timeout=15,
            )
            if resp.status_code == 200 and resp.json():
                return resp.json()

            normalized = _normalize_cover_match_title(title)
            pattern = "*" + "*".join(normalized.split()) + "*"
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/series",
                headers=headers,
                params={**base_params, "title": f"ilike.{pattern}"},
                timeout=15,
            )
            if resp.status_code != 200:
                return []
            return [
                row for row in (resp.json() or [])
                if _normalize_cover_match_title(row.get("title")) == normalized
            ]
        except Exception:
            return []

    candidates = []
    for nm in (target_name, cv_volume_name):
        if nm:
            candidates = _query(nm)
            if candidates:
                break

    chosen = None
    if len(candidates) == 1:
        chosen = candidates[0].get("gcd_id")
    elif len(candidates) > 1 and year is not None:
        best, best_delta = None, 999
        for c in candidates:
            ys = c.get("year_start_cached")
            if ys is None:
                continue
            delta = abs(int(ys) - int(year))
            if delta < best_delta:
                best, best_delta = c, delta
        if best and best_delta <= 3:
            chosen = best.get("gcd_id")

    _SERIES_GCD_ID_CACHE[key] = chosen
    return chosen


def _load_gcd_issues(series_gcd_id: int) -> list[dict]:
    series_gcd_id = int(series_gcd_id)
    if series_gcd_id in _GCD_ISSUES_BY_SERIES_CACHE:
        return _GCD_ISSUES_BY_SERIES_CACHE[series_gcd_id]

    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/gcd_issues",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            },
            params={
                "select": "gcd_id,issue_number,title,publication_date,key_date,publisher_gcd_id",
                "series_gcd_id": f"eq.{series_gcd_id}",
                "order": "gcd_id.asc",
                "limit": str(page_size),
                "offset": str(offset),
            },
            timeout=30,
        )
        resp.raise_for_status()
        page = resp.json() or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    _GCD_ISSUES_BY_SERIES_CACHE[series_gcd_id] = rows
    return rows


def _resolve_gcd_issue_id(
    series_gcd_id: int | None, issue_number: object
) -> tuple[int | None, str]:
    """Mirror resolveGcdIssueId() in src/lib/coverMatch.js."""
    if series_gcd_id is None:
        return None, "unresolved"
    issues = _load_gcd_issues(int(series_gcd_id))
    raw = str(issue_number or "").strip()
    candidates = [i for i in issues if str(i.get("issue_number") or "").strip() == raw]
    if not candidates:
        base = _base_issue_number(raw)
        if base:
            candidates = [i for i in issues if _base_issue_number(i.get("issue_number")) == base]
    if len(candidates) > 1:
        signatures = {
            (
                issue.get("issue_number"),
                issue.get("title"),
                issue.get("publication_date"),
                issue.get("key_date"),
                issue.get("publisher_gcd_id"),
            )
            for issue in candidates
        }
        # The local GCD mirror occasionally duplicates identical catalog rows.
        # Collapse only exact metadata duplicates; real variants stay ambiguous.
        if len(signatures) == 1:
            candidates = [min(candidates, key=lambda issue: int(issue["gcd_id"]))]
    if len(candidates) == 1:
        return int(candidates[0]["gcd_id"]), "resolved"
    return None, "series-only"


def upsert_cover_row(row: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    resp = requests.post(
        url,
        headers=headers,
        params={"on_conflict": "source_issue_url"},
        json=[row],
        timeout=60,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"DB upsert failed: {resp.status_code} {resp.text}")


def get_volume(volume_id: int) -> dict:
    data = cv_get(
        f"volume/4050-{volume_id}/",
        {
            "field_list": "id,name,publisher,start_year,api_detail_url,count_of_issues",
        },
    )
    return data.get("results") or {}


def main():
    args = parse_cli()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    uploaded_rows = []

    if args.volume_id:
        vid = parse_volume_id(args.volume_id)
        if not vid:
            print(f"Could not parse --volume-id: {args.volume_id!r}", file=sys.stderr)
            sys.exit(2)

        # Pre-flight: fetch volume details and confirm with the user BEFORE
        # downloading any covers. Without this, a wrong ID silently ingests
        # whatever's at that volume (which is how Donald Duck #1-N ended up
        # tagged as Uncanny X-Men).
        try:
            preview = get_volume(vid)
        except Exception as e:
            print(f"Could not fetch ComicVine volume {vid}: {e}", file=sys.stderr)
            sys.exit(2)

        if not preview:
            print(f"ComicVine returned no volume for id {vid}.", file=sys.stderr)
            sys.exit(2)

        preview_pub = (preview.get("publisher") or {}).get("name") or "(unknown)"
        preview_name = preview.get("name") or "(unknown)"
        preview_year = preview.get("start_year") or "?"
        preview_count = preview.get("count_of_issues") or "?"

        print()
        print("─" * 70)
        print(f"  About to ingest ComicVine volume {vid}:")
        print(f"    Name:         {preview_name}")
        print(f"    Publisher:    {preview_pub}")
        print(f"    Start year:   {preview_year}")
        print(f"    Issue count:  {preview_count}")
        print("─" * 70)

        # Optional safety: hard-fail if --expect-publisher disagrees.
        if args.expect_publisher:
            if _norm_publisher(preview_pub) != _norm_publisher(args.expect_publisher):
                print(
                    f"  ✗ publisher mismatch: expected {args.expect_publisher!r}, "
                    f"got {preview_pub!r}. Aborting.",
                    file=sys.stderr,
                )
                sys.exit(3)

        if not args.yes:
            try:
                answer = input("  Proceed? [y/N] ").strip().lower()
            except EOFError:
                answer = ""
            if answer not in ("y", "yes"):
                print("  Aborted by user.")
                sys.exit(0)

        targets = [{"name": None, "publisher": None, "year": None, "volume_id": vid}]
        source_label = f"--volume-id {vid}"
    elif args.targets:
        targets = load_targets_from_file(args.targets)
        source_label = f"--targets {args.targets}"
    else:
        targets = TARGET_VOLUMES
        source_label = "TARGET_VOLUMES (hardcoded)"

    if not targets:
        print("No target volumes to process.", file=sys.stderr)
        sys.exit(1)

    print(
        f"Processing {len(targets)} target volume(s) "
        f"(source: {source_label}, "
        f"skip-existing: {bool(args.skip_existing)}, "
        f"max-search-calls: {args.max_search_calls}, "
        f"vol-sleep: {args.vol_sleep}s)"
    )

    limit_per_volume = args.limit if args.limit is not None else LIMIT_TEST
    rate_limited = False

    # Done-ledger only applies to --targets runs (a single --volume-id has no
    # list to sweep). --ignore-done starts fresh without touching the file.
    use_ledger = bool(args.targets) and not args.ignore_done and not args.dry_run
    done = _load_done(args.done_file) if use_ledger else set()
    if use_ledger and done:
        print(f"Done-ledger: {len(done)} target(s) already processed — will skip before searching.")
    skipped_done = 0

    for target in targets:
        # Skip already-processed targets BEFORE spending a search call. This is
        # what makes successive runs advance down the list instead of re-grinding
        # the top. (Skip happens before the budget check so done targets are free.)
        if use_ledger and not target.get("volume_id") and _done_key(target) in done:
            skipped_done += 1
            continue

        # Budget check: stop BEFORE making the next search if we're already
        # past the cap. Cleaner than getting a 420 mid-run.
        search_volume_used = REQUEST_COUNTER["search"] + REQUEST_COUNTER["volume"]
        if search_volume_used >= args.max_search_calls:
            print(
                f"\n── Budget cap reached "
                f"({search_volume_used} search+volume calls ≥ {args.max_search_calls}). "
                f"Exiting cleanly. Re-run later with --skip-existing to resume."
            )
            break
        volume_name = target["name"]
        publisher_name = target.get("publisher")
        explicit_volume_id = target.get("volume_id")

        print(f"\n=== Processing volume: {volume_name} ({publisher_name or 'any publisher'}) ===")

        try:
            if explicit_volume_id:
                volume = get_volume(explicit_volume_id)
                print(f"  using explicit volume id: {explicit_volume_id}")
            else:
                volume = find_volume(volume_name, publisher_name, target.get("year"))

            if not volume:
                print(f"  volume not found: {volume_name}")
                # Only mark "true not-found" failures done. Ambiguous-match
                # failures (multiple volumes named X with same publisher and
                # year) might be resolvable by a future matcher improvement
                # — marking them done would silently lock them out forever.
                # AMBIGUOUS_THIS_RUN is populated by _record_needs_volume_id
                # in every ambiguous-branch return of find_volume.
                was_ambiguous = (
                    volume_name,
                    publisher_name,
                    target.get("year"),
                ) in AMBIGUOUS_THIS_RUN
                if use_ledger and not target.get("volume_id") and not was_ambiguous:
                    done.add(_done_key(target))
                    _save_done(args.done_file, done)
                continue

            print(
                "  matched volume:",
                volume.get("name"),
                "| id:",
                volume.get("id"),
                "| publisher:",
                (volume.get("publisher") or {}).get("name"),
                "| issue count:",
                volume.get("count_of_issues"),
            )

            cv_pub_name = (volume.get("publisher") or {}).get("name")
            if cv_pub_name and not args.dry_run:
                update_series_cv_publisher(volume.get("name"), cv_pub_name)

            # Resolve gcd_series id for this volume so canonical_covers rows
            # can be joined by integer ID instead of fragile title string.
            # Falls back to None silently — downstream code tolerates it.
            target_gcd_id = _resolve_series_gcd_id(
                volume_name,
                volume.get("name"),
                target.get("year") or volume.get("start_year"),
            )

            volume_id = volume["id"]
            issues = fetch_issues_for_volume(volume_id)
            print(f"  fetched {len(issues)} issues")

            if limit_per_volume:
                issues = issues[:limit_per_volume]
                print(f"  testing first {len(issues)} issues only")

            already_uploaded: set[str] = set()
            if args.skip_existing:
                already_uploaded = fetch_existing_storage_paths(volume_id)
                if already_uploaded:
                    print(
                        f"  skip-existing: {len(already_uploaded)} issues already have covers"
                    )

            for idx, issue in enumerate(issues, start=1):
                issue_number_key = (
                    str(issue.get("issue_number") or "").strip().lower()
                )
                if issue_number_key and issue_number_key in already_uploaded:
                    print(
                        f"  [{idx}/{len(issues)}] skip (already uploaded) "
                        f"#{issue.get('issue_number')}"
                    )
                    continue
                issue_id = issue.get("id")
                issue_title = issue.get("name") or f"Issue {issue.get('issue_number')}"
                issue_number = issue.get("issue_number")
                api_detail_url = issue.get("api_detail_url")
                image = issue.get("image") or {}
                cover_url = (
                    image.get("original_url")
                    or image.get("super_url")
                    or image.get("large_url")
                    or image.get("medium_url")
                    or image.get("small_url")
                    or image.get("thumb_url")
                )

                print(f"  [{idx}/{len(issues)}] {issue_title} #{issue_number}")

                series_year = None
                for date_value in (issue.get("cover_date"), issue.get("store_date")):
                    m = re.search(r"\b(18|19|20)\d{2}\b", str(date_value or ""))
                    if m:
                        series_year = int(m.group(0))
                        break

                comicvine_volume_id = None
                try:
                    comicvine_volume_id = int(volume.get("id")) if volume.get("id") else None
                except Exception:
                    comicvine_volume_id = None

                gcd_issue_id, match_confidence = _resolve_gcd_issue_id(
                    target_gcd_id, issue_number
                )
                print(
                    f"    match: series_gcd_id={target_gcd_id} "
                    f"gcd_issue_id={gcd_issue_id} confidence={match_confidence}"
                )

                storage_path = None
                if cover_url and not args.dry_run:
                    try:
                        ext = guess_ext(cover_url)
                        safe_series = slugify(volume.get("name"))
                        safe_issue = slugify(issue_title)

                        storage_path = (
                            f"comicvine/{safe_series}/vol-{comicvine_volume_id}/"
                            f"{issue_id}-{safe_issue}{ext}"
                        )

                        image_bytes = download_image_bytes(cover_url)
                        upload_to_supabase_storage(
                            storage_path,
                            image_bytes,
                            guess_content_type(ext),
                        )
                    except Exception as e:
                        print(f"    image upload failed: {e}")
                        storage_path = None

                row = {
                    "source": "comicvine",
                    "source_issue_url": api_detail_url or f"comicvine-issue-{issue_id}",
                    "external_issue_id": str(issue_id),
                    "comicvine_volume_id": comicvine_volume_id,
                    "series_year": series_year,
                    "series_title": volume.get("name"),
                    "series_gcd_id": target_gcd_id,
                    "gcd_issue_id": gcd_issue_id,
                    "match_confidence": match_confidence,
                    "issue_title": issue_title,
                    "issue_number": issue_number,
                    "publisher": ((volume.get("publisher") or {}).get("name")),
                    "cover_date": issue.get("cover_date"),
                    "in_store_date": issue.get("store_date"),
                    "description": issue.get("description"),
                    "original_cover_url": cover_url,
                    "storage_path": storage_path,
                }

                if args.dry_run:
                    uploaded_rows.append(row)
                else:
                    try:
                        upsert_cover_row(row)
                        uploaded_rows.append(row)
                    except Exception as e:
                        print(f"    db upsert failed: {e}")

                time.sleep(0.5)

            # Reached the end of this volume's issues without a rate-limit or
            # crash — it's fully handled. Mark it so re-runs skip it pre-search.
            if use_ledger and not target.get("volume_id"):
                done.add(_done_key(target))
                _save_done(args.done_file, done)

        except RateLimited as e:
            # Hard stop: ComicVine slammed the door. Continuing would just
            # generate 200 more 420s and burn the rolling window further.
            print(f"  ✗ {e}")
            print("  Stopping run — re-run later with --skip-existing to resume.")
            rate_limited = True
            break
        except Exception as e:
            print(f"  series failed: {_safe_error(e)}")
            # fall through to per-volume sleep below

        # Sleep BETWEEN volumes regardless of success/failure. The skip path
        # (no match found) still consumed a search call, which counts against
        # the rate window. Without this sleep, width-mode mass-skipping would
        # blow the budget in seconds.
        time.sleep(max(0.0, args.vol_sleep))

    ledger_note = (
        f" | skipped {skipped_done} already-done (ledger), {len(done)} total in {args.done_file}"
        if use_ledger else ""
    )
    if rate_limited:
        print(
            f"\nPartial run. Counters: "
            f"search={REQUEST_COUNTER['search']} "
            f"volume={REQUEST_COUNTER['volume']} "
            f"issues={REQUEST_COUNTER['issues']}{ledger_note}"
        )
    else:
        print(
            f"\nFinished cleanly. Counters: "
            f"search={REQUEST_COUNTER['search']} "
            f"volume={REQUEST_COUNTER['volume']} "
            f"issues={REQUEST_COUNTER['issues']}{ledger_note}"
        )

    if not args.dry_run:
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "source",
                    "source_issue_url",
                    "external_issue_id",
                    "comicvine_volume_id",
                    "series_year",
                    "series_title",
                    "series_gcd_id",
                    "gcd_issue_id",
                    "match_confidence",
                    "issue_title",
                    "issue_number",
                    "publisher",
                    "cover_date",
                    "in_store_date",
                    "description",
                    "original_cover_url",
                    "storage_path",
                ],
            )
            writer.writeheader()
            writer.writerows(uploaded_rows)

    print(f"\nDone. Upserted {len(uploaded_rows)} issue rows total.")
    if not args.dry_run:
        print(f"CSV written to {CSV_PATH}")

    if NEEDS_VOLUME_ID:
        write_needs_volume_id(args.needs_volume_id_out)


if __name__ == "__main__":
    main()
