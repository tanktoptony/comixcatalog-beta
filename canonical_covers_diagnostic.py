"""
Read-only diagnostic for canonical_covers.

Reports:
  - total rows, breakdown by source
  - rows with storage_path by source
  - collisions: normalized (series_title, issue_number) keys shared between
    a gcd row and a comicvine row (both with storage_path) — these are the
    rows that silently shadow each other in the frontend lookup.

Usage:
    python canonical_covers_diagnostic.py
"""

import os
import re

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}


def norm_title(v):
    return re.sub(r"[^a-z0-9]", "", (v or "").strip().lower())


def norm_issue(v):
    return str(v or "").strip().lower()


def count(params):
    url = f"{SUPABASE_URL}/rest/v1/canonical_covers"
    resp = requests.get(
        url,
        headers={
            **HEADERS,
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": "0-0",
        },
        params={**params, "select": "id"},
        timeout=60,
    )
    resp.raise_for_status()
    cr = resp.headers.get("Content-Range", "")
    total = cr.split("/")[-1] if "/" in cr else ""
    return int(total) if total.isdigit() else None


def fetch_all(source):
    url = f"{SUPABASE_URL}/rest/v1/canonical_covers"
    rows = []
    offset = 0
    page = 1000
    while True:
        resp = requests.get(
            url,
            headers=HEADERS,
            params={
                "select": "source,series_title,issue_number,storage_path",
                "source": f"eq.{source}",
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


def main():
    print("=== canonical_covers diagnostic ===")
    total = count({})
    gcd = count({"source": "eq.gcd"}) or 0
    cv = count({"source": "eq.comicvine"}) or 0
    other = (total or 0) - gcd - cv
    gcd_with_path = count({"source": "eq.gcd", "storage_path": "not.is.null"}) or 0
    cv_with_path = count({"source": "eq.comicvine", "storage_path": "not.is.null"}) or 0

    print(f"total rows: {total}")
    print(f"  source=gcd:       {gcd}  (with storage_path: {gcd_with_path})")
    print(f"  source=comicvine: {cv}   (with storage_path: {cv_with_path})")
    print(f"  source=other:     {other}")

    if cv == 0:
        print("\nno comicvine rows — nothing to clean up.")
        return

    print("\nchecking collisions (normalized title+issue matches between sources)...")
    gcd_rows = fetch_all("gcd")
    cv_rows = fetch_all("comicvine")

    gcd_keys = {
        f"{norm_title(r['series_title'])}::{norm_issue(r['issue_number'])}"
        for r in gcd_rows
        if r.get("storage_path")
    }
    cv_colliding = [
        r for r in cv_rows
        if r.get("storage_path") and
        f"{norm_title(r['series_title'])}::{norm_issue(r['issue_number'])}" in gcd_keys
    ]
    print(f"  gcd rows fetched:            {len(gcd_rows)}")
    print(f"  cv  rows fetched:            {len(cv_rows)}")
    print(f"  cv rows shadowing a gcd row: {len(cv_colliding)}")

    if cv_colliding:
        print("  sample (first 5):")
        for s in cv_colliding[:5]:
            print(f"    - {s['series_title']} #{s['issue_number']}")


if __name__ == "__main__":
    main()
