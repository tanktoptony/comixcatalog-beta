import csv
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(".env.local")

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

TARGET_VOLUMES = [
    # --- Marvel: Bronze/Modern Keys & Popular Runs ---
    # When a name matches multiple ComicVine volumes (e.g. "X-Men Annual"
    # exists for 1970, 1992, 1995, 2000, 2007, 2018…), prefer setting
    # `volume_id` directly from the ComicVine URL — e.g.
    # https://comicvine.gamespot.com/x-men-annual/4050-22988/ → volume_id=22988.
    # This bypasses the name+year search and removes ambiguity.
    {"name": "X-Men Annual", "publisher": "Marvel", "volume_id": 22988},
    {"name": "X-Men Annual", "publisher": "Marvel", "volume_id": 10748},
]

LIMIT_TEST = None  # set to None for full run


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "item"


def cv_get(endpoint: str, params: dict) -> dict:
    full_params = {
        "api_key": COMICVINE_API_KEY,
        "format": "json",
        **params,
    }
    resp = requests.get(
        f"{BASE_API}/{endpoint}",
        params=full_params,
        headers=HEADERS,
        timeout=60,
    )
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


def find_volume(name: str, publisher: str | None = None, year: int | None = None) -> dict | None:
    data = cv_get(
        "search/",
        {
            "query": name,
            "resources": "volume",
            "field_list": "id,name,publisher,start_year,api_detail_url",
            "limit": 20,
        },
    )
    results = data.get("results") or []

    name_pub_matches = []
    for vol in results:
        if (vol.get("name") or "").lower() != name.lower():
            continue
        if publisher:
            pub_name = ((vol.get("publisher") or {}).get("name") or "").lower()
            if pub_name != publisher.lower():
                continue
        name_pub_matches.append(vol)

    if year is not None:
        for vol in name_pub_matches:
            if _start_year_of(vol) == year:
                return vol
        for vol in name_pub_matches:
            sy = _start_year_of(vol)
            if sy is not None and abs(sy - year) <= 1:
                return vol

    if name_pub_matches:
        return name_pub_matches[0]
    return results[0] if results else None


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
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    uploaded_rows = []

    for target in TARGET_VOLUMES:
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
            if cv_pub_name:
                update_series_cv_publisher(volume.get("name"), cv_pub_name)

            volume_id = volume["id"]
            issues = fetch_issues_for_volume(volume_id)
            print(f"  fetched {len(issues)} issues")

            if LIMIT_TEST:
                issues = issues[:LIMIT_TEST]
                print(f"  testing first {len(issues)} issues only")

            for idx, issue in enumerate(issues, start=1):
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

                storage_path = None
                if cover_url:
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
                    "issue_title": issue_title,
                    "issue_number": issue_number,
                    "publisher": ((volume.get("publisher") or {}).get("name")),
                    "cover_date": issue.get("cover_date"),
                    "in_store_date": issue.get("store_date"),
                    "description": issue.get("description"),
                    "original_cover_url": cover_url,
                    "storage_path": storage_path,
                }

                try:
                    upsert_cover_row(row)
                    uploaded_rows.append(row)
                except Exception as e:
                    print(f"    db upsert failed: {e}")

                time.sleep(0.5)

        except Exception as e:
            print(f"  series failed: {e}")
            continue

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
    print(f"CSV written to {CSV_PATH}")


if __name__ == "__main__":
    main()