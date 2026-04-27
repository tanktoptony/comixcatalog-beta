"""
GCD covers scraper — targeted backfill for issues already in user collections.

What it does:
  1. Pulls the set of distinct gcd_issue_id values from user_collections.
  2. Joins to gcd_issues + series to build (gcd_id, series_title, issue_number) triples.
  3. Finds triples with no matching canonical_covers row (normalized key).
  4. Scrapes https://www.comics.org/issue/<gcd_id>/ for each, uploads the
     cover to the canonical-covers bucket, and upserts a canonical_covers row.

Politeness:
  - Default 1.5s sleep between GCD requests (override with GCD_SLEEP_SECONDS).
  - User-Agent identifies the project so GCD admins can contact us if needed.

Usage:
    python gcd_scraper_to_supabase.py
    LIMIT_TEST=5 python gcd_scraper_to_supabase.py   # scrape only first 5 gaps

Requires .env.local with:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    (optional) SUPABASE_BUCKET, defaults to "canonical-covers"
    (optional) SUPABASE_TABLE,  defaults to "canonical_covers"
"""

import os
import re
import time
from pathlib import Path
from typing import Iterable

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "canonical-covers")
SUPABASE_TABLE = os.environ.get("SUPABASE_TABLE", "canonical_covers")

GCD_BASE = "https://www.comics.org"
GCD_SLEEP_SECONDS = float(os.environ.get("GCD_SLEEP_SECONDS", "1.5"))
LIMIT_TEST = int(os.environ["LIMIT_TEST"]) if os.environ.get("LIMIT_TEST") else None

SUPA_HEADERS = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}

GCD_HEADERS = {
    "User-Agent": "ComixCatalog/1.0 (contact: anthony.jarina@gmail.com)",
    "Accept": "text/html,application/xhtml+xml",
}

CHUNK = 200  # Supabase IN-filter batch size


def norm_title(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").strip().lower())


def norm_issue(value) -> str:
    return str(value or "").strip().lower()


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-") or "item"


def chunked(seq: list, size: int) -> Iterable[list]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def supa_get(table: str, params: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=SUPA_HEADERS, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def supa_get_all(table: str, select: str, ids_column: str, ids: list, extra: dict | None = None) -> list[dict]:
    out = []
    for batch in chunked(list({str(i) for i in ids if i is not None}), CHUNK):
        params = {"select": select, ids_column: f"in.({','.join(batch)})"}
        if extra:
            params.update(extra)
        out.extend(supa_get(table, params))
    return out


def upload_to_bucket(storage_path: str, content: bytes, content_type: str) -> None:
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{storage_path}"
    headers = {
        **SUPA_HEADERS,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    resp = requests.post(url, headers=headers, data=content, timeout=120)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload failed: {resp.status_code} {resp.text}")


def upsert_cover_row(row: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        **SUPA_HEADERS,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    resp = requests.post(
        url,
        headers=headers,
        params={"on_conflict": "source_issue_url"},
        json=[row],
        timeout=60,
    )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"DB upsert failed: {resp.status_code} {resp.text}")


def fetch_gcd_cover_url(gcd_issue_id: int) -> str | None:
    """Return the direct image URL for the primary cover, or None."""
    page = requests.get(
        f"{GCD_BASE}/issue/{gcd_issue_id}/",
        headers=GCD_HEADERS,
        timeout=60,
    )
    if page.status_code == 404:
        return None
    page.raise_for_status()

    soup = BeautifulSoup(page.text, "html.parser")

    # Primary: the <img> with class "cover_img" inside the cover gallery
    img = soup.select_one("img.cover_img")
    if img and img.get("src"):
        return _absolutize(img["src"])

    # Fallback 1: any <img> whose src points at files*.comics.org
    for candidate in soup.select("img[src]"):
        src = candidate.get("src", "")
        if "files" in src and "comics.org" in src and "/covers_by_id/" in src:
            return _absolutize(src)

    # Fallback 2: /issue/<id>/cover/ page (older GCD layout)
    cover_page = requests.get(
        f"{GCD_BASE}/issue/{gcd_issue_id}/cover/",
        headers=GCD_HEADERS,
        timeout=60,
    )
    if cover_page.status_code == 200:
        soup2 = BeautifulSoup(cover_page.text, "html.parser")
        for candidate in soup2.select("img[src]"):
            src = candidate.get("src", "")
            if "covers_by_id" in src:
                return _absolutize(src)

    return None


def _absolutize(src: str) -> str:
    if src.startswith("//"):
        return f"https:{src}"
    if src.startswith("/"):
        return f"{GCD_BASE}{src}"
    return src


def guess_ext(url: str) -> str:
    url = url.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if ext in url:
            return ext
    return ".jpg"


def guess_content_type(ext: str) -> str:
    return {".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")


def main():
    print(f"Scraper: bucket={SUPABASE_BUCKET} table={SUPABASE_TABLE} sleep={GCD_SLEEP_SECONDS}s")

    # 1. distinct gcd_issue_ids currently in user_collections
    uc_rows = supa_get(
        "user_collections",
        {"select": "gcd_issue_id", "gcd_issue_id": "not.is.null"},
    )
    gcd_ids = sorted({row["gcd_issue_id"] for row in uc_rows if row.get("gcd_issue_id")})
    print(f"user_collections references {len(gcd_ids)} distinct GCD issues")
    if not gcd_ids:
        return

    # 2. gcd_issues → (gcd_id, series_gcd_id, issue_number)
    issues = supa_get_all(
        "gcd_issues",
        "gcd_id,series_gcd_id,issue_number",
        "gcd_id",
        gcd_ids,
    )
    series_gcd_ids = sorted({i["series_gcd_id"] for i in issues if i.get("series_gcd_id")})

    # 3. series → title
    series_rows = supa_get_all(
        "series",
        "gcd_id,title",
        "gcd_id",
        series_gcd_ids,
    )
    series_title_by_gcd = {str(s["gcd_id"]): s.get("title") for s in series_rows}

    triples = []
    for i in issues:
        title = series_title_by_gcd.get(str(i.get("series_gcd_id")))
        if not title:
            continue
        triples.append(
            {
                "gcd_id": i["gcd_id"],
                "series_title": title,
                "issue_number": i.get("issue_number"),
            }
        )
    print(f"resolved {len(triples)} (series_title, issue_number) triples")

    # 4. existing canonical_covers — build normalized key set
    titles = sorted({t["series_title"] for t in triples})
    existing = supa_get_all(
        "canonical_covers",
        "series_title,issue_number,storage_path",
        "series_title",
        titles,
        extra={"storage_path": "not.is.null"},
    )
    have_keys = {
        f"{norm_title(r['series_title'])}::{norm_issue(r['issue_number'])}"
        for r in existing
    }
    print(f"canonical_covers already has {len(have_keys)} matching rows with storage_path")

    # 5. gaps
    gaps = [
        t
        for t in triples
        if f"{norm_title(t['series_title'])}::{norm_issue(t['issue_number'])}" not in have_keys
    ]
    print(f"{len(gaps)} gaps to scrape")
    if LIMIT_TEST:
        gaps = gaps[:LIMIT_TEST]
        print(f"  LIMIT_TEST: {len(gaps)} only")
    if not gaps:
        return

    # 6. scrape each
    scraped = skipped = failed = 0
    for idx, t in enumerate(gaps, start=1):
        gcd_id = t["gcd_id"]
        series_title = t["series_title"]
        issue_number = t["issue_number"]
        prefix = f"[{idx}/{len(gaps)}] gcd-{gcd_id} {series_title} #{issue_number}"

        try:
            cover_url = fetch_gcd_cover_url(gcd_id)
            if not cover_url:
                print(f"{prefix} — no cover on GCD")
                skipped += 1
                time.sleep(GCD_SLEEP_SECONDS)
                continue

            ext = guess_ext(cover_url)
            storage_path = (
                f"gcd/{slugify(series_title)}/{gcd_id}-{slugify(str(issue_number))}{ext}"
            )

            img = requests.get(cover_url, headers=GCD_HEADERS, timeout=120)
            img.raise_for_status()

            upload_to_bucket(storage_path, img.content, guess_content_type(ext))

            upsert_cover_row(
                {
                    "source": "gcd",
                    "source_issue_url": f"{GCD_BASE}/issue/{gcd_id}/",
                    "external_issue_id": str(gcd_id),
                    "series_title": series_title,
                    "issue_number": issue_number,
                    "original_cover_url": cover_url,
                    "storage_path": storage_path,
                }
            )

            print(f"{prefix} ✓")
            scraped += 1
        except Exception as e:
            print(f"{prefix} FAILED: {e}")
            failed += 1

        time.sleep(GCD_SLEEP_SECONDS)

    print(f"\nDone. scraped={scraped} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
