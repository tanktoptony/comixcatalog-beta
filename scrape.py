import csv
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv(".env.local")

VOLUME_URL = "https://comicvine.gamespot.com/the-x-men/4050-2133/?sortBy=asc"
BASE_URL = "https://comicvine.gamespot.com"

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "canonical-covers")
SUPABASE_TABLE = os.environ.get("SUPABASE_TABLE", "canonical_covers")

OUT_DIR = Path("comicvine_xmen_supabase")
CSV_PATH = OUT_DIR / "issues_uploaded.csv"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "issue"


def fetch_html(session: requests.Session, url: str) -> BeautifulSoup:
    resp = session.get(url, headers=HEADERS, timeout=30)
    print("FETCH", url, resp.status_code)
    if resp.status_code != 200:
        print(resp.text[:1000])
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")

def extract_issue_links(volume_soup: BeautifulSoup) -> list[str]:
    links = []
    seen = set()

    for a in volume_soup.select('a[href*="/4000-"]'):
        href = a.get("href")
        if not href:
            continue

        full = urljoin(BASE_URL, href)
        if "/4000-" not in full:
            continue

        if full in seen:
            continue

        seen.add(full)
        links.append(full)

    return links


def extract_meta(soup: BeautifulSoup, prop: str) -> str | None:
    tag = soup.find("meta", attrs={"property": prop})
    if tag and tag.get("content"):
        return tag["content"].strip()

    tag = soup.find("meta", attrs={"name": prop})
    if tag and tag.get("content"):
        return tag["content"].strip()

    return None


def extract_text_after_label(soup: BeautifulSoup, label: str) -> str | None:
    text_nodes = soup.find_all(string=re.compile(rf"^\s*{re.escape(label)}\s*$", re.I))
    for node in text_nodes:
        parent = node.parent
        if not parent:
            continue

        cursor = parent
        for _ in range(10):
            cursor = cursor.find_next()
            if not cursor:
                break
            txt = cursor.get_text(" ", strip=True)
            if txt and txt.lower() != label.lower():
                return txt
    return None


def extract_cover_url(issue_soup: BeautifulSoup) -> str | None:
    og_image = extract_meta(issue_soup, "og:image")
    if og_image:
        return og_image

    selectors = [
        'img[src*="scale_large"]',
        'img[src*="scale_small"]',
        'img[src*="comicvine.gamespot.com"]',
        ".wiki-details img",
        ".issue img",
        "figure img",
    ]
    for selector in selectors:
        img = issue_soup.select_one(selector)
        if img and img.get("src"):
            return urljoin(BASE_URL, img["src"])

    return None


def parse_external_issue_id(issue_url: str) -> str | None:
    m = re.search(r"/4000-(\d+)/?$", issue_url)
    return m.group(1) if m else None


def infer_extension(url: str) -> str:
    path = urlparse(url).path.lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(ext):
            return ext
    return ".jpg"


def extract_issue_data(session: requests.Session, issue_url: str, series_title: str) -> dict:
    soup = fetch_html(session, issue_url)

    title = extract_meta(soup, "og:title")
    description = extract_meta(soup, "og:description")
    cover_url = extract_cover_url(soup)

    issue_number = extract_text_after_label(soup, "Issue Number")
    cover_date = extract_text_after_label(soup, "Cover Date")
    in_store_date = extract_text_after_label(soup, "In Store Date")

    publisher = None
    if description:
        m = re.search(r"released by\s+(.+?)\s+on\s+", description, re.I)
        if m:
            publisher = m.group(1).strip()

    if not publisher:
        page_text = soup.get_text(" ", strip=True)
        m = re.search(r"released by\s+(.+?)\s+on\s+", page_text, re.I)
        if m:
            publisher = m.group(1).strip()

    return {
        "source": "comicvine",
        "source_issue_url": issue_url,
        "external_issue_id": parse_external_issue_id(issue_url),
        "series_title": series_title,
        "issue_title": title,
        "issue_number": issue_number,
        "publisher": publisher,
        "cover_date": cover_date,
        "in_store_date": in_store_date,
        "description": description,
        "original_cover_url": cover_url,
    }


def download_image_bytes(session: requests.Session, url: str) -> bytes:
    resp = session.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.content


def upload_to_supabase_storage(storage_path: str, content: bytes, content_type: str = "image/jpeg") -> str:
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

    return storage_path


def upsert_cover_row(row: dict):
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

    return resp.json()


def guess_content_type(ext: str) -> str:
    ext = ext.lower()
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "image/jpeg"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()

    print(f"Loading volume page: {VOLUME_URL}")
    volume_soup = fetch_html(session, VOLUME_URL)

    series_title = extract_meta(volume_soup, "og:title") or "Unknown Series"
    series_title = series_title.replace(" | Comic Vine", "").strip()

    issue_links = extract_issue_links(volume_soup)
    print(f"Found {len(issue_links)} issue links")

    uploaded_rows = []

    for idx, issue_url in enumerate(issue_links, start=1):
        print(f"[{idx}/{len(issue_links)}] {issue_url}")

        try:
            data = extract_issue_data(session, issue_url, series_title=series_title)
        except Exception as e:
            print(f"  issue scrape failed: {e}")
            continue

        storage_path = None

        try:
            if data["original_cover_url"]:
                ext = infer_extension(data["original_cover_url"])
                safe_series = slugify(data["series_title"])
                safe_issue = slugify(data["issue_title"] or f"issue-{idx}")
                external_id = data["external_issue_id"] or str(idx)
                storage_path = f"comicvine/{safe_series}/{external_id}-{safe_issue}{ext}"

                image_bytes = download_image_bytes(session, data["original_cover_url"])
                upload_to_supabase_storage(
                    storage_path=storage_path,
                    content=image_bytes,
                    content_type=guess_content_type(ext),
                )
        except Exception as e:
            print(f"  image upload failed: {e}")

        db_row = {
            **data,
            "storage_path": storage_path,
        }

        try:
            upsert_cover_row(db_row)
            uploaded_rows.append(db_row)
        except Exception as e:
            print(f"  db upsert failed: {e}")

        time.sleep(1.0)

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "source",
                "source_issue_url",
                "external_issue_id",
                "series_title",
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

    print(f"\nDone. Uploaded/upserted {len(uploaded_rows)} rows.")
    print(f"CSV written to: {CSV_PATH}")


if __name__ == "__main__":
    main()