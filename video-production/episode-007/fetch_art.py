"""Pull character and interior art for Episode 007 from the DC and Marvel Databases.

Every image on each wiki page below lands in
Desktop/YouTube/episode-007-assets/art/<folder>/, with sources.json recording the
wiki file page and original URL (credited in the description, like Episode 006's
Marvel Database art). Icons and small images are skipped; existing files are kept.

    python episode-007/fetch_art.py
"""

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path.home() / "Desktop" / "YouTube" / "episode-007-assets" / "art"
UA = "Mozilla/5.0 (ComixCatalogVideo/1.0)"
DC = "https://dc.fandom.com"
MARVEL = "https://marvel.fandom.com"

# (wiki, page title, folder)
PAGES = [
    (DC, "Bruce Wayne (Absolute Universe)", "absolute-bruce"),
    (DC, "Edward Nygma (Absolute Universe)", "absolute-nygma"),
    (DC, "Harvey Dent (Absolute Universe)", "absolute-dent"),
    (DC, "Oswald Cobblepot (Absolute Universe)", "absolute-cobblepot"),
    (DC, "Waylon Jones (Absolute Universe)", "absolute-jones"),
    (DC, "Alfred Pennyworth (Absolute Universe)", "absolute-alfred"),
    (DC, "Roman Sionis (Absolute Universe)", "absolute-sionis"),
    (DC, "Absolute Batman Vol 1 1", "absolute-batman-1"),
    (DC, "Edward Nygma (New Earth)", "classic-riddler"),
    (DC, "Harvey Dent (New Earth)", "classic-two-face"),
    (DC, "Oswald Cobblepot (New Earth)", "classic-penguin"),
    (DC, "Waylon Jones (New Earth)", "classic-killer-croc"),
    (DC, "Alfred Pennyworth (New Earth)", "classic-alfred"),
    (DC, "Roman Sionis (New Earth)", "classic-black-mask"),
    (DC, "Jean-Paul Valley (New Earth)", "azrael"),
    (DC, "Jean-Paul Valley (New Earth)/Gallery", "azrael-gallery"),
    (DC, "Bane (New Earth)", "bane"),
    (DC, "Batman Vol 1 497", "batman-497"),
    (DC, "Batman Vol 1 500", "batman-500"),
    (DC, "Batman: Sword of Azrael Vol 1 1", "sword-of-azrael-1"),
    (DC, "Court of Owls (Prime Earth)", "court-of-owls"),
    (DC, "Talon (Prime Earth)", "talon"),
    (DC, "Batman Vol 2 1", "batman-2011-1"),
    (DC, "Batman Vol 2 5", "batman-2011-5"),
    (DC, "Batman: The Dark Knight Returns Vol 1 1", "dkr-1"),
    (DC, "Batman: The Dark Knight Returns Vol 1 4", "dkr-4"),
    (DC, "Batman Returns", "batman-returns-film"),
    (DC, "Batman: The Animated Series", "btas"),
    (MARVEL, "Benjamin Reilly (Earth-616)/Gallery", "ben-reilly"),
]

SKIP = re.compile(r"(icon|logo|stub|placeholder|\.svg$|\.gif$|no_image|noimage|Wiki-wordmark)", re.I)


def get_json(base, params):
    url = f"{base}/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        dest.write_bytes(r.read())


def main():
    for base, title, folder in PAGES:
        out = OUT / folder
        out.mkdir(parents=True, exist_ok=True)
        sources_path = out / "sources.json"
        sources = json.loads(sources_path.read_text()) if sources_path.exists() else {}
        params = {
            "action": "query", "generator": "images", "titles": title, "gimlimit": 500,
            "prop": "imageinfo", "iiprop": "url|size", "format": "json",
        }
        pages = get_json(base, params).get("query", {}).get("pages", {})
        kept = 0
        for p in pages.values():
            info = (p.get("imageinfo") or [{}])[0]
            name = p["title"].split(":", 1)[1]
            if SKIP.search(name) or info.get("width", 0) < 300 or "url" not in info:
                continue
            dest = out / re.sub(r"[^\w.\-]+", "_", name)
            if not dest.exists():
                download(info["url"], dest)
                time.sleep(0.3)
            sources[dest.name] = {
                "wikiPage": f"{base}/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                "filePage": info.get("descriptionurl"),
                "image": info["url"],
                "size": [info.get("width"), info.get("height")],
            }
            kept += 1
        sources_path.write_text(json.dumps(sources, indent=2))
        print(f"{kept:4d}  {folder}  ({title})")


if __name__ == "__main__":
    main()
