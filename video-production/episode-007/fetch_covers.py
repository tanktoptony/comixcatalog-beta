"""Pull Episode 007 covers from ComicVine into Desktop/YouTube/episode-007-assets/covers.

Same layout as Episode 006: <slug>-<NNN>-<year>.jpg plus sources.json with the
ComicVine issue id, cover date, page and image URL for each file. Already
downloaded files are skipped, so re-running only fetches what's new.

    python episode-007/fetch_covers.py
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
OUT = Path.home() / "Desktop" / "YouTube" / "episode-007-assets" / "covers"
UA = "ComixCatalogVideo/1.0"

# (ComicVine volume id, file slug, issue numbers)
BOOKS = [
    (3593, "dark-knight-returns", ["1", "2", "3", "4"]),
    (796, "batman", ["492", "497", "498", "500"]),
    (9223, "sword-of-azrael", ["1", "2", "3", "4"]),
    (5490, "azrael", ["1"]),
    (26467, "batman-returns-adaptation", ["1"]),
    (4716, "batman-adventures", ["1"]),
    (42721, "batman-2011", ["1", "2", "3", "4", "5", "6", "7"]),
    (160294, "absolute-batman", ["1", "2", "3", "4", "5", "6"]),
    (120309, "house-of-x", ["1"]),
    (120407, "powers-of-x", ["1"]),
    (3519, "web-of-spider-man", ["118"]),
    (5788, "sensational-spider-man", ["0"]),
]


def api_key():
    for line in (REPO / ".env.local").read_text().splitlines():
        if line.startswith("COMICVINE_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("COMICVINE_API_KEY missing from .env.local")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    key = api_key()
    OUT.mkdir(parents=True, exist_ok=True)
    sources_path = OUT / "sources.json"
    sources = json.loads(sources_path.read_text()) if sources_path.exists() else {}

    for volume, slug, numbers in BOOKS:
        query = urllib.parse.urlencode({
            "api_key": key,
            "format": "json",
            "filter": f"volume:{volume}",
            "field_list": "id,name,issue_number,cover_date,site_detail_url,image",
            "limit": 100,
        })
        issues = []
        offset = 0
        while True:
            data = json.loads(get(f"https://comicvine.gamespot.com/api/issues/?{query}&offset={offset}"))
            issues += data["results"]
            offset += len(data["results"])
            if not data["results"] or offset >= data["number_of_total_results"] or all(
                any(i["issue_number"] == n for i in issues) for n in numbers
            ):
                break
            time.sleep(1)
        by_number = {i["issue_number"]: i for i in issues}

        for n in numbers:
            issue = by_number.get(n)
            if not issue:
                print(f"MISSING  {slug} #{n} (volume {volume})")
                continue
            year = (issue.get("cover_date") or "0000")[:4]
            num = n.zfill(3) if re.fullmatch(r"\d+", n) else n
            name = f"{slug}-{num}-{year}.jpg"
            image = issue["image"]["original_url"]
            if not (OUT / name).exists():
                (OUT / name).write_bytes(get(image))
                time.sleep(1)
            sources[name] = {
                "source": "ComicVine",
                "issueId": issue["id"],
                "coverDate": issue.get("cover_date"),
                "title": issue.get("name"),
                "page": issue.get("site_detail_url"),
                "image": image,
            }
            print(f"ok       {name}  {issue.get('name') or ''}")
        time.sleep(1)

    sources_path.write_text(json.dumps(sources, indent=2))


if __name__ == "__main__":
    main()
