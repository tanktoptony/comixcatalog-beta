"""
Diagnose cover lookup for a single series UUID.

Given a series UUID, reproduces the exact query /api/series/[id]/route.js runs:
  - loads series.title + series.gcd_id
  - loads gcd_issues for that series (issue_number, publication_date)
  - queries canonical_covers with eq(series_title=series.title) + in(issue_number=...) + storage_path not null
  - reports per-issue: has CV row? series_year match? would render?
  - also reports canonical_covers rows whose issue_number matches ANY issue for this
    series regardless of series_title, to reveal string-mismatch candidates.

Usage:
    python series_lookup_diagnostic.py <series_uuid>
"""

import os
import re
import sys
from collections import Counter

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}


def supa_get(table, params):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=HEADERS,
        params=params,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def parse_year(value):
    if not value:
        return None
    m = re.search(r"\b(18|19|20)\d{2}\b", str(value))
    return int(m.group(0)) if m else None


def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def main():
    if len(sys.argv) < 2:
        print("usage: python series_lookup_diagnostic.py <series_uuid>")
        sys.exit(1)
    series_id = sys.argv[1]

    series_rows = supa_get(
        "series",
        {"select": "id,gcd_id,title", "id": f"eq.{series_id}"},
    )
    if not series_rows:
        print(f"no series row with id={series_id}")
        return
    s = series_rows[0]
    print(f"series.id    = {s['id']}")
    print(f"series.title = {s['title']!r}")
    print(f"series.gcd_id= {s.get('gcd_id')}")

    if not s.get("gcd_id"):
        print("series has no gcd_id — route returns empty issues array")
        return

    issue_rows = []
    offset = 0
    while True:
        batch = supa_get(
            "gcd_issues",
            {
                "select": "gcd_id,issue_number,publication_date",
                "series_gcd_id": f"eq.{s['gcd_id']}",
                "order": "gcd_id.asc",
                "limit": 500,
                "offset": offset,
            },
        )
        if not batch:
            break
        issue_rows.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    print(f"gcd_issues   = {len(issue_rows)}")
    if not issue_rows:
        return

    issue_numbers = list({r["issue_number"] for r in issue_rows if r.get("issue_number") is not None})
    issue_years = {
        r["issue_number"]: parse_year(r.get("publication_date"))
        for r in issue_rows
        if r.get("issue_number") is not None
    }
    allowed_years = {y for y in issue_years.values() if y is not None}
    print(f"unique issue_numbers: {len(issue_numbers)}")
    print(f"issue years range:    {min(allowed_years) if allowed_years else None} – {max(allowed_years) if allowed_years else None}")

    cover_rows_exact = []
    for batch in chunked(issue_numbers, 200):
        in_list = ",".join(f'"{str(v).replace(chr(34), chr(92)+chr(34))}"' for v in batch)
        cover_rows_exact.extend(
            supa_get(
                "canonical_covers",
                {
                    "select": "source,series_title,series_year,issue_number,storage_path",
                    "series_title": f"eq.{s['title']}",
                    "issue_number": f"in.({in_list})",
                    "storage_path": "not.is.null",
                },
            )
        )
    print(f"\ncanonical_covers with exact series_title match: {len(cover_rows_exact)}")
    if cover_rows_exact:
        src_counter = Counter(r.get("source") for r in cover_rows_exact)
        year_counter = Counter(r.get("series_year") for r in cover_rows_exact)
        print(f"  by source: {dict(src_counter)}")
        print(f"  by series_year: {dict(year_counter)}")

    would_render = 0
    if cover_rows_exact:
        by_issue_year = {
            (str(r["issue_number"]).strip().lower(), r.get("series_year")): r
            for r in cover_rows_exact
        }
        by_issue = {}
        for r in cover_rows_exact:
            k = str(r["issue_number"]).strip().lower()
            by_issue.setdefault(k, []).append(r)

        for issue in issue_rows:
            iy = parse_year(issue.get("publication_date"))
            ikey = str(issue.get("issue_number") or "").strip().lower()
            if not ikey:
                continue
            rows_for_issue = [
                r for r in by_issue.get(ikey, [])
                if r.get("series_year") is None or (iy is not None and int(r["series_year"]) == iy)
            ]
            if rows_for_issue:
                would_render += 1
    print(f"\nissues that would render a cover on the series page: {would_render} / {len(issue_rows)}")

    print("\n--- mismatch probe: canonical_covers with matching issue_number + year window, ANY series_title ---")
    probe = []
    for batch in chunked(issue_numbers[:20], 200):
        in_list = ",".join(f'"{str(v).replace(chr(34), chr(92)+chr(34))}"' for v in batch)
        probe.extend(
            supa_get(
                "canonical_covers",
                {
                    "select": "source,series_title,series_year,issue_number",
                    "issue_number": f"in.({in_list})",
                    "storage_path": "not.is.null",
                    "limit": 500,
                },
            )
        )
    title_counter = Counter((r.get("source"), r.get("series_title"), r.get("series_year")) for r in probe)
    print(f"  probe scanned {len(probe)} rows for first 20 issue numbers")
    print(f"  distinct (source, series_title, series_year) combos:")
    for (src, title, yr), count in title_counter.most_common(15):
        marker = "  <-- matches series.title" if title == s["title"] else ""
        print(f"    {count:4d}  source={src!r:12}  year={yr}  title={title!r}{marker}")


if __name__ == "__main__":
    main()
