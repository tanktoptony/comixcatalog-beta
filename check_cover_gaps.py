"""
check_cover_gaps.py — Read-only diagnostic.

Combines TARGET_VOLUMES from both target_volumes_seed.py and
comicvine_api_to_supabase.py, deduplicates them, then checks
canonical_covers to report which series still need cover ingestion.

Output:
  COVERED  — has at least one row with storage_path (image uploaded)
  NO IMAGE — row exists but storage_path is NULL (CV returned no cover)
  MISSING  — zero rows in canonical_covers for this title+year

Usage:
    python check_cover_gaps.py
    python check_cover_gaps.py --missing-only
"""

import os
import re
import sys
from dotenv import load_dotenv
import requests

load_dotenv(".env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}

YEAR_TOLERANCE = 1
MISSING_ONLY = "--missing-only" in sys.argv


# ── Load both target lists ───────────────────────────────────────────────────

from target_volumes_seed import TARGET_VOLUMES as SEED_VOLUMES

# Safe import from ingestion script: pull only TARGET_VOLUMES via ast so we
# don't trigger the RuntimeError on missing COMICVINE_API_KEY.
import ast, pathlib

def _extract_target_volumes(path: str) -> list[dict]:
    src = pathlib.Path(path).read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "TARGET_VOLUMES":
                    return ast.literal_eval(node.value)
    return []

INGEST_VOLUMES = _extract_target_volumes("comicvine_api_to_supabase.py")

# Merge and deduplicate by (normalized name, year)
def _norm_key(entry: dict) -> tuple:
    name = re.sub(r"[^a-z0-9]", "", (entry.get("name") or "").strip().lower())
    return (name, entry.get("year"))

seen = set()
ALL_TARGETS: list[dict] = []
for v in SEED_VOLUMES + INGEST_VOLUMES:
    k = _norm_key(v)
    if k not in seen:
        seen.add(k)
        ALL_TARGETS.append(v)

ALL_TARGETS.sort(key=lambda v: (v.get("publisher", ""), v.get("name", ""), v.get("year") or 0))


# ── Fetch canonical_covers from Supabase ─────────────────────────────────────

def fetch_cv_covers() -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/canonical_covers"
    rows = []
    offset = 0
    page = 1000
    while True:
        resp = requests.get(
            url,
            headers=HEADERS,
            params={
                "select": "series_title,series_year,storage_path",
                "source": "eq.comicvine",
                "limit": page,
                "offset": offset,
            },
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def norm(v: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (v or "").strip().lower())


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"Targets: {len(SEED_VOLUMES)} seed + {len(INGEST_VOLUMES)} ingestion = {len(ALL_TARGETS)} unique after dedup\n")
    print("Fetching canonical_covers from Supabase…")
    all_rows = fetch_cv_covers()
    print(f"  {len(all_rows)} ComicVine rows loaded\n")

    # Build: norm_title -> list of (series_year, has_storage_path)
    index: dict[str, list[tuple]] = {}
    for r in all_rows:
        key = norm(r.get("series_title", ""))
        if not key:
            continue
        year = r.get("series_year")
        has_img = bool(r.get("storage_path"))
        index.setdefault(key, []).append((year, has_img))

    results = {"COVERED": [], "NO IMAGE": [], "MISSING": []}

    for t in ALL_TARGETS:
        name = t["name"]
        year = t.get("year")
        nk = norm(name)
        entries = index.get(nk, [])

        if not entries:
            status = "MISSING"
        else:
            # Year-aware: prefer rows within YEAR_TOLERANCE
            year_matches = [
                (y, has) for (y, has) in entries
                if year is None or y is None or abs(int(y) - int(year)) <= YEAR_TOLERANCE
            ]
            if not year_matches:
                # Title exists in DB but only for a different volume year
                other_years = sorted({int(y) for (y, _) in entries if y is not None})
                status = f"YEAR MISS (DB has: {other_years}, wanted: {year})"
                results.setdefault("YEAR MISS", []).append({**t, "_note": f"DB years: {other_years}"})
                if not MISSING_ONLY:
                    print(f"  {'YEAR MISS':<10} {name:<50} {str(year):<6}  DB has years {other_years}")
                continue
            has_image = any(has for (_, has) in year_matches)
            status = "COVERED" if has_image else "NO IMAGE"

        results[status].append(t)
        if not MISSING_ONLY or status in ("MISSING", "NO IMAGE"):
            tag = f"[{status}]"
            print(f"  {tag:<12} {name:<50} {str(year) if year else '—'}")

    # Summary
    print(f"\n{'='*70}")
    covered = len(results.get("COVERED", []))
    no_img  = len(results.get("NO IMAGE", []))
    missing = len(results.get("MISSING", []))
    yr_miss = len(results.get("YEAR MISS", []))
    total   = len(ALL_TARGETS)

    print(f"COVERED:    {covered:>3}  ({covered/total*100:.0f}%)")
    print(f"NO IMAGE:   {no_img:>3}  (row in DB but ComicVine had no image)")
    print(f"MISSING:    {missing:>3}  (not ingested yet)")
    print(f"YEAR MISS:  {yr_miss:>3}  (title found but wrong volume year)")
    print(f"TOTAL:      {total:>3}")

    needs_work = results.get("MISSING", []) + results.get("NO IMAGE", []) + results.get("YEAR MISS", [])
    if needs_work:
        print(f"\n── Re-run these in comicvine_api_to_supabase.py ──")
        for t in needs_work:
            note = f'  # YEAR MISS — DB has {t["_note"]}' if "_note" in t else ""
            clean = {k: v for k, v in t.items() if k != "_note"}
            print(f'  {{"name": "{clean["name"]}", "publisher": "{clean.get("publisher","")}", "year": {clean.get("year")}}},{note}')


if __name__ == "__main__":
    main()
