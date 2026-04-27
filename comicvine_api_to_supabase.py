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
    {"name": "Tomb of Dracula", "publisher": "Marvel", "year": 1972},
    {"name": "Werewolf by Night", "publisher": "Marvel", "year": 1972},
    {"name": "Marvel Spotlight", "publisher": "Marvel", "year": 1971},
    {"name": "Marvel Premiere", "publisher": "Marvel", "year": 1972},
    {"name": "Master of Kung Fu", "publisher": "Marvel", "year": 1974},
    {"name": "Iron Fist", "publisher": "Marvel", "year": 1975},
    {"name": "Power Man and Iron Fist", "publisher": "Marvel", "year": 1978},
    {"name": "Moon Knight", "publisher": "Marvel", "year": 1980},
    {"name": "Moon Knight", "publisher": "Marvel", "year": 2016},
    {"name": "Ms. Marvel", "publisher": "Marvel", "year": 2014},
    {"name": "Captain Marvel", "publisher": "Marvel", "year": 2012},
    {"name": "Black Panther", "publisher": "Marvel", "year": 2005},
    {"name": "Black Panther", "publisher": "Marvel", "year": 2016},
    {"name": "Runaways", "publisher": "Marvel", "year": 2003},
    {"name": "Young Avengers", "publisher": "Marvel", "year": 2005},
    {"name": "Hawkeye", "publisher": "Marvel", "year": 2012},
    {"name": "Vision", "publisher": "Marvel", "year": 2015},
    {"name": "Immortal Hulk", "publisher": "Marvel", "year": 2018},
    {"name": "Silver Surfer", "publisher": "Marvel", "year": 1968},
    {"name": "Silver Surfer", "publisher": "Marvel", "year": 1987},
    {"name": "Nova", "publisher": "Marvel", "year": 1976},
    {"name": "Annihilation", "publisher": "Marvel", "year": 2006},
    {"name": "Guardians of the Galaxy", "publisher": "Marvel", "year": 2008},
    {"name": "Old Man Logan", "publisher": "Marvel", "year": 2016},
    {"name": "House of M", "publisher": "Marvel", "year": 2005},
    {"name": "Civil War", "publisher": "Marvel", "year": 2006},
    {"name": "Secret Wars", "publisher": "Marvel", "year": 1984},
    {"name": "Secret Wars", "publisher": "Marvel", "year": 2015},

    # --- DC: Keys & Influential Runs ---
    {"name": "Crisis on Infinite Earths", "publisher": "DC Comics", "year": 1985},
    {"name": "The Dark Knight Returns", "publisher": "DC Comics", "year": 1986},
    {"name": "Batman: The Killing Joke", "publisher": "DC Comics", "year": 1988},
    {"name": "Watchmen", "publisher": "DC Comics", "year": 1986},
    {"name": "JSA", "publisher": "DC Comics", "year": 1999},
    {"name": "Justice Society of America", "publisher": "DC Comics", "year": 2007},
    {"name": "Doom Patrol", "publisher": "DC Comics", "year": 1987},
    {"name": "Catwoman", "publisher": "DC Comics", "year": 2002},
    {"name": "Catwoman", "publisher": "DC Comics", "year": 2018},
    {"name": "Harley Quinn", "publisher": "DC Comics", "year": 2000},
    {"name": "Harley Quinn", "publisher": "DC Comics", "year": 2013},
    {"name": "Birds of Prey", "publisher": "DC Comics", "year": 1999},
    {"name": "Suicide Squad", "publisher": "DC Comics", "year": 1987},
    {"name": "Starman", "publisher": "DC Comics", "year": 1994},
    {"name": "Hitman", "publisher": "DC Comics", "year": 1996},
    {"name": "Kingdom Come", "publisher": "DC Comics", "year": 1996},
    {"name": "Identity Crisis", "publisher": "DC Comics", "year": 2004},
    {"name": "Final Crisis", "publisher": "DC Comics", "year": 2008},
    {"name": "All Star Superman", "publisher": "DC Comics", "year": 2005},
    {"name": "DC: The New Frontier", "publisher": "DC Comics", "year": 2004},

    # --- Vertigo / DC Imprints ---
    {"name": "Y: The Last Man", "publisher": "DC Comics", "year": 2002},
    {"name": "Fables", "publisher": "DC Comics", "year": 2002},
    {"name": "100 Bullets", "publisher": "DC Comics", "year": 1999},
    {"name": "Transmetropolitan", "publisher": "DC Comics", "year": 1997},
    {"name": "Hellblazer", "publisher": "DC Comics", "year": 1988},
    {"name": "Lucifer", "publisher": "DC Comics", "year": 2000},
    {"name": "American Vampire", "publisher": "DC Comics", "year": 2010},
    {"name": "Scalped", "publisher": "DC Comics", "year": 2007},
    {"name": "DMZ", "publisher": "DC Comics", "year": 2005},

    # --- Image: Modern Indie Staples ---
    {"name": "Saga", "publisher": "Image", "year": 2012},
    {"name": "Sex Criminals", "publisher": "Image", "year": 2013},
    {"name": "Black Science", "publisher": "Image", "year": 2013},
    {"name": "Deadly Class", "publisher": "Image", "year": 2014},
    {"name": "Paper Girls", "publisher": "Image", "year": 2015},
    {"name": "Wytches", "publisher": "Image", "year": 2014},
    {"name": "Outcast by Kirkman & Azaceta", "publisher": "Image", "year": 2014},
    {"name": "Kick-Ass", "publisher": "Image", "year": 2018},
    {"name": "Bitter Root", "publisher": "Image", "year": 2018},
    {"name": "Die", "publisher": "Image", "year": 2018},
    {"name": "Something is Killing the Children", "publisher": "Boom! Studios", "year": 2019},
    {"name": "Gideon Falls", "publisher": "Image", "year": 2018},
    {"name": "Monstress", "publisher": "Image", "year": 2015},
    {"name": "Descender", "publisher": "Image", "year": 2015},
    {"name": "Ascender", "publisher": "Image", "year": 2019},
    {"name": "Kill or Be Killed", "publisher": "Image", "year": 2016},
    {"name": "Manhattan Projects", "publisher": "Image", "year": 2012},
    {"name": "Lazarus", "publisher": "Image", "year": 2013},
    {"name": "Birthright", "publisher": "Image", "year": 2014},
    {"name": "Snotgirl", "publisher": "Image", "year": 2016},

    # --- Indie / Small Press Classics ---
    {"name": "Bone", "publisher": "Cartoon Books", "year": 1991},
    {"name": "Scott Pilgrim", "publisher": "Oni Press", "year": 2004},
    {"name": "Strangers in Paradise", "publisher": "Abstract Studio", "year": 1996},
    {"name": "Powers", "publisher": "Image", "year": 2000},
    {"name": "Hellboy", "publisher": "Dark Horse Comics", "year": 1994},
    {"name": "B.P.R.D.", "publisher": "Dark Horse Comics", "year": 2003},
    {"name": "Sin City", "publisher": "Dark Horse Comics", "year": 1991},
    {"name": "300", "publisher": "Dark Horse Comics", "year": 1998},
    {"name": "Concrete", "publisher": "Dark Horse Comics", "year": 1987},
    {"name": "Usagi Yojimbo", "publisher": "Dark Horse Comics", "year": 1996},

    # --- IDW: Deeper cuts (deduped vs your list) ---
    {"name": "30 Days of Night", "publisher": "IDW Publishing", "year": 2002},
    {"name": "Sonic the Hedgehog", "publisher": "IDW Publishing", "year": 2018},
    {"name": "Transformers: More than Meets the Eye", "publisher": "IDW Publishing", "year": 2012},
    {"name": "Transformers: Lost Light", "publisher": "IDW Publishing", "year": 2016},
    {"name": "Optimus Prime", "publisher": "IDW Publishing", "year": 2016},
    {"name": "Transformers vs. G.I. Joe", "publisher": "IDW Publishing", "year": 2014},
    {"name": "Cobra", "publisher": "IDW Publishing", "year": 2011},
    {"name": "Snake Eyes", "publisher": "IDW Publishing", "year": 2011},
    {"name": "TMNT Universe", "publisher": "IDW Publishing", "year": 2016},
    {"name": "TMNT: The Last Ronin", "publisher": "IDW Publishing", "year": 2020},
    {"name": "Doctor Who", "publisher": "IDW Publishing", "year": 2009},
    {"name": "X-Files", "publisher": "IDW Publishing", "year": 2013},
    {"name": "Ghostbusters", "publisher": "IDW Publishing", "year": 2011},
    {"name": "Judge Dredd", "publisher": "IDW Publishing", "year": 2012},
    {"name": "Rom", "publisher": "IDW Publishing", "year": 2016},
    {"name": "Micronauts", "publisher": "IDW Publishing", "year": 2016},
    {"name": "Mars Attacks", "publisher": "IDW Publishing", "year": 2012},
    {"name": "Canto", "publisher": "IDW Publishing", "year": 2019},
    {"name": "Dark Spaces: Wildfire", "publisher": "IDW Publishing", "year": 2022},

    # --- Dark Horse: Beyond the staples ---
    {"name": "Hellboy", "publisher": "Dark Horse Comics", "year": 1994},  # ongoing series, distinct from Seed of Destruction mini
    {"name": "Black Hammer", "publisher": "Dark Horse Comics", "year": 2016},
    {"name": "Concrete", "publisher": "Dark Horse Comics", "year": 1987},
    {"name": "300", "publisher": "Dark Horse Comics", "year": 1998},
    {"name": "Usagi Yojimbo", "publisher": "Dark Horse Comics", "year": 1996},
    {"name": "Conan", "publisher": "Dark Horse Comics", "year": 2003},
    {"name": "Conan the Barbarian", "publisher": "Dark Horse Comics", "year": 2012},
    {"name": "Star Wars", "publisher": "Dark Horse Comics", "year": 2013},
    {"name": "Star Wars: Dark Empire", "publisher": "Dark Horse Comics", "year": 1991},
    {"name": "Buffy the Vampire Slayer Season 8", "publisher": "Dark Horse Comics", "year": 2007},
    {"name": "Aliens vs. Predator", "publisher": "Dark Horse Comics", "year": 1990},
    {"name": "Beasts of Burden", "publisher": "Dark Horse Comics", "year": 2009},
    {"name": "Empowered", "publisher": "Dark Horse Comics", "year": 2007},
    {"name": "Dept. H", "publisher": "Dark Horse Comics", "year": 2016},

    # --- Valiant: Modern/relaunches you don't have ---
    {"name": "Faith", "publisher": "Valiant Entertainment", "year": 2016},
    {"name": "Britannia", "publisher": "Valiant Entertainment", "year": 2016},
    {"name": "Divinity", "publisher": "Valiant Entertainment", "year": 2015},
    {"name": "Eternal Warrior", "publisher": "Valiant Entertainment", "year": 2013},
    {"name": "Doctor Mirage", "publisher": "Valiant Entertainment", "year": 2014},
    {"name": "Rai", "publisher": "Valiant Entertainment", "year": 2014},
    # Classic Valiant
    {"name": "Magnus, Robot Fighter", "publisher": "Valiant", "year": 1991},
    {"name": "Solar, Man of the Atom", "publisher": "Valiant", "year": 1991},
    {"name": "Eternal Warrior", "publisher": "Valiant", "year": 1992},
    {"name": "Rai", "publisher": "Valiant", "year": 1992},

    # --- Dynamite: Beyond the headliners ---
    {"name": "The Lone Ranger", "publisher": "Dynamite Entertainment", "year": 2006},
    {"name": "John Carter, Warlord of Mars", "publisher": "Dynamite Entertainment", "year": 2010},
    {"name": "Battlestar Galactica", "publisher": "Dynamite Entertainment", "year": 2006},
    {"name": "Sheena: Queen of the Jungle", "publisher": "Dynamite Entertainment", "year": 2017},
    {"name": "Will Eisner's The Spirit", "publisher": "Dynamite Entertainment", "year": 2010},

    # --- Archie / Dark Circle ---
    {"name": "Riverdale", "publisher": "Archie Comics", "year": 2017},
    {"name": "The Black Hood", "publisher": "Dark Circle", "year": 2015},
    {"name": "The Shield", "publisher": "Dark Circle", "year": 2015},
    {"name": "Cosmo", "publisher": "Archie Comics", "year": 2016},
    {"name": "Sonic Universe", "publisher": "Archie Comics", "year": 2009},

    # --- Newer indie publishers (likely 0% coverage in your DB) ---
    {"name": "We Can Never Go Home", "publisher": "Black Mask", "year": 2015},
    {"name": "4 Kids Walk Into a Bank", "publisher": "Black Mask", "year": 2016},
    {"name": "Kim & Kim", "publisher": "Black Mask", "year": 2016},
    {"name": "These Savage Shores", "publisher": "Vault Comics", "year": 2018},
    {"name": "Heathen", "publisher": "Vault Comics", "year": 2017},
    {"name": "Engineward", "publisher": "Vault Comics", "year": 2020},
    {"name": "The Wrong Earth", "publisher": "AHOY Comics", "year": 2018},
    {"name": "Edgar Allan Poe's Snifter of Terror", "publisher": "AHOY Comics", "year": 2018},
    {"name": "Providence", "publisher": "Avatar Press", "year": 2015},
    {"name": "Crossed", "publisher": "Avatar Press", "year": 2008},
    {"name": "Fathom", "publisher": "Aspen Comics", "year": 2005},
    {"name": "Soulfire", "publisher": "Aspen Comics", "year": 2004},

    # --- Oni Press (beyond Scott Pilgrim) ---
    {"name": "Letter 44", "publisher": "Oni Press", "year": 2013},
    {"name": "Stumptown", "publisher": "Oni Press", "year": 2009},
    {"name": "Wasteland", "publisher": "Oni Press", "year": 2006},
    {"name": "Rick and Morty", "publisher": "Oni Press", "year": 2015},

    # --- Boom! Studios Modern Hits ---
    {"name": "Mouse Guard", "publisher": "Archaia", "year": 2006},
    {"name": "Lumberjanes", "publisher": "Boom! Studios", "year": 2014},
    {"name": "Giant Days", "publisher": "Boom! Studios", "year": 2015},
    {"name": "Once & Future", "publisher": "Boom! Studios", "year": 2019},
    {"name": "Wynd", "publisher": "Boom! Studios", "year": 2020},
    {"name": "Faithless", "publisher": "Boom! Studios", "year": 2019},

    # --- AfterShock / Other Indies ---
    {"name": "Animosity", "publisher": "AfterShock Comics", "year": 2016},
    {"name": "Babyteeth", "publisher": "AfterShock Comics", "year": 2017},

    # --- Underrated Bronze Age Marvel ---
    {"name": "Defenders", "publisher": "Marvel", "year": 1972},
    {"name": "Champions", "publisher": "Marvel", "year": 1975},
    {"name": "Marvel Two-in-One", "publisher": "Marvel", "year": 1974},
    {"name": "Marvel Team-Up", "publisher": "Marvel", "year": 1972},
    {"name": "What If", "publisher": "Marvel", "year": 1977},

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