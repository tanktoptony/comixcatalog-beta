"""
Seed list of ~100 comic volumes for Comic Vine ingest.

Each entry uses the shape consumed by comicvine_api_to_supabase.py:
  {"name": str, "publisher": str, "year": int}

`volume_id` is intentionally omitted — the existing find_volume() search
resolves to the correct CV volume using name + publisher + start_year.
If a lookup misses or resolves to the wrong run, add an explicit
"volume_id": <int> from comicvine.gamespot.com for that entry.

Usage:
    from target_volumes_seed import TARGET_VOLUMES as SEED
    # then in comicvine_api_to_supabase.py:
    # TARGET_VOLUMES = SEED
"""

TARGET_VOLUMES = [
    # ── Marvel: Spider-Man ──────────────────────────────────────────────
    {"name": "The Amazing Spider-Man", "publisher": "Marvel", "year": 1963},
    {"name": "The Amazing Spider-Man", "publisher": "Marvel", "year": 1999},
    {"name": "The Amazing Spider-Man", "publisher": "Marvel", "year": 2014},
    {"name": "The Amazing Spider-Man", "publisher": "Marvel", "year": 2018},
    {"name": "The Amazing Spider-Man", "publisher": "Marvel", "year": 2022},
    {"name": "Ultimate Spider-Man", "publisher": "Marvel", "year": 2000},
    {"name": "Spectacular Spider-Man", "publisher": "Marvel", "year": 1976},

    # ── Marvel: X-Men family ────────────────────────────────────────────
    {"name": "The Uncanny X-Men", "publisher": "Marvel", "year": 1963},
    {"name": "Uncanny X-Men", "publisher": "Marvel", "year": 2018},
    {"name": "X-Men", "publisher": "Marvel", "year": 1991},
    {"name": "X-Men", "publisher": "Marvel", "year": 2013},
    {"name": "X-Men", "publisher": "Marvel", "year": 2019},
    {"name": "New X-Men", "publisher": "Marvel", "year": 2001},
    {"name": "Astonishing X-Men", "publisher": "Marvel", "year": 2004},
    {"name": "X-Force", "publisher": "Marvel", "year": 1991},
    {"name": "X-Force", "publisher": "Marvel", "year": 2008},
    {"name": "X-Force", "publisher": "Marvel", "year": 2019},
    {"name": "The New Mutants", "publisher": "Marvel", "year": 1983},
    {"name": "Excalibur", "publisher": "Marvel", "year": 1988},
    {"name": "Wolverine", "publisher": "Marvel", "year": 1988},
    {"name": "Wolverine", "publisher": "Marvel", "year": 2003},
    {"name": "Wolverine", "publisher": "Marvel", "year": 2020},
    {"name": "Cable", "publisher": "Marvel", "year": 1993},
    {"name": "Deadpool", "publisher": "Marvel", "year": 1997},
    {"name": "Deadpool", "publisher": "Marvel", "year": 2008},
    {"name": "Deadpool", "publisher": "Marvel", "year": 2012},
    {"name": "House of X", "publisher": "Marvel", "year": 2019},
    {"name": "Powers of X", "publisher": "Marvel", "year": 2019},

    # ── Marvel: Avengers family ─────────────────────────────────────────
    {"name": "The Avengers", "publisher": "Marvel", "year": 1963},
    {"name": "Avengers", "publisher": "Marvel", "year": 1998},
    {"name": "The Avengers", "publisher": "Marvel", "year": 2010},
    {"name": "Avengers", "publisher": "Marvel", "year": 2012},
    {"name": "Avengers", "publisher": "Marvel", "year": 2018},
    {"name": "New Avengers", "publisher": "Marvel", "year": 2005},
    {"name": "New Avengers", "publisher": "Marvel", "year": 2010},
    {"name": "Young Avengers", "publisher": "Marvel", "year": 2005},
    {"name": "West Coast Avengers", "publisher": "Marvel", "year": 1985},
    {"name": "Captain America", "publisher": "Marvel", "year": 1968},
    {"name": "Captain America", "publisher": "Marvel", "year": 2004},
    {"name": "Captain America", "publisher": "Marvel", "year": 2011},
    {"name": "The Invincible Iron Man", "publisher": "Marvel", "year": 1968},
    {"name": "Invincible Iron Man", "publisher": "Marvel", "year": 2008},
    {"name": "The Mighty Thor", "publisher": "Marvel", "year": 1966},
    {"name": "Thor", "publisher": "Marvel", "year": 2007},
    {"name": "Thor", "publisher": "Marvel", "year": 2014},
    {"name": "The Incredible Hulk", "publisher": "Marvel", "year": 1968},
    {"name": "Hulk", "publisher": "Marvel", "year": 1999},
    {"name": "Hawkeye", "publisher": "Marvel", "year": 2012},
    {"name": "Ms. Marvel", "publisher": "Marvel", "year": 2014},
    {"name": "Vision", "publisher": "Marvel", "year": 2015},

    # ── Marvel: Street-level & cosmic ───────────────────────────────────
    {"name": "Daredevil", "publisher": "Marvel", "year": 1964},
    {"name": "Daredevil", "publisher": "Marvel", "year": 1998},
    {"name": "Daredevil", "publisher": "Marvel", "year": 2011},
    {"name": "The Punisher", "publisher": "Marvel", "year": 1987},
    {"name": "The Punisher", "publisher": "Marvel", "year": 2000},
    {"name": "The Punisher", "publisher": "Marvel", "year": 2004},
    {"name": "Moon Knight", "publisher": "Marvel", "year": 1980},
    {"name": "Moon Knight", "publisher": "Marvel", "year": 2021},
    {"name": "Ghost Rider", "publisher": "Marvel", "year": 1990},
    {"name": "Doctor Strange", "publisher": "Marvel", "year": 2015},
    {"name": "Silver Surfer", "publisher": "Marvel", "year": 1987},
    {"name": "Black Panther", "publisher": "Marvel", "year": 2016},
    {"name": "Fantastic Four", "publisher": "Marvel", "year": 1961},
    {"name": "Fantastic Four", "publisher": "Marvel", "year": 1998},
    {"name": "The New Warriors", "publisher": "Marvel", "year": 1990},
    {"name": "New Warriors", "publisher": "Marvel", "year": 1999},
    {"name": "New Warriors", "publisher": "Marvel", "year": 2005},
    {"name": "New Warriors", "publisher": "Marvel", "year": 2007},
    {"name": "Secret Wars", "publisher": "Marvel", "year": 2015},

    # ── DC: Trinity ─────────────────────────────────────────────────────
    {"name": "Action Comics", "publisher": "DC Comics", "year": 1938},
    {"name": "Detective Comics", "publisher": "DC Comics", "year": 1937},
    {"name": "Batman", "publisher": "DC Comics", "year": 1940},
    {"name": "Batman", "publisher": "DC Comics", "year": 2011},
    {"name": "Batman", "publisher": "DC Comics", "year": 2016},
    {"name": "Superman", "publisher": "DC Comics", "year": 1939},
    {"name": "Superman", "publisher": "DC Comics", "year": 1987},
    {"name": "Superman", "publisher": "DC Comics", "year": 2011},
    {"name": "Wonder Woman", "publisher": "DC Comics", "year": 1987},
    {"name": "Wonder Woman", "publisher": "DC Comics", "year": 2016},

    # ── DC: Justice League & Teen Titans ────────────────────────────────
    {"name": "Justice League of America", "publisher": "DC Comics", "year": 1960},
    {"name": "Justice League", "publisher": "DC Comics", "year": 2011},
    {"name": "JLA", "publisher": "DC Comics", "year": 1997},
    {"name": "The New Teen Titans", "publisher": "DC Comics", "year": 1980},
    {"name": "Teen Titans", "publisher": "DC Comics", "year": 2003},

    # ── DC: Rest of core DC ─────────────────────────────────────────────
    {"name": "The Flash", "publisher": "DC Comics", "year": 1987},
    {"name": "The Flash", "publisher": "DC Comics", "year": 2016},
    {"name": "Green Lantern", "publisher": "DC Comics", "year": 1990},
    {"name": "Green Lantern", "publisher": "DC Comics", "year": 2005},
    {"name": "Green Arrow", "publisher": "DC Comics", "year": 1988},
    {"name": "Aquaman", "publisher": "DC Comics", "year": 2011},
    {"name": "Nightwing", "publisher": "DC Comics", "year": 1996},
    {"name": "Catwoman", "publisher": "DC Comics", "year": 1993},
    {"name": "Birds of Prey", "publisher": "DC Comics", "year": 1999},
    {"name": "Harley Quinn", "publisher": "DC Comics", "year": 2013},

    # ── DC: Vertigo ─────────────────────────────────────────────────────
    {"name": "The Sandman", "publisher": "DC Comics", "year": 1989},
    {"name": "Swamp Thing", "publisher": "DC Comics", "year": 1982},
    {"name": "Hellblazer", "publisher": "DC Comics", "year": 1988},
    {"name": "Preacher", "publisher": "DC Comics", "year": 1995},
    {"name": "Y: The Last Man", "publisher": "DC Comics", "year": 2002},
    {"name": "Fables", "publisher": "DC Comics", "year": 2002},
    {"name": "Transmetropolitan", "publisher": "DC Comics", "year": 1997},

    # ── Image ───────────────────────────────────────────────────────────
    {"name": "Spawn", "publisher": "Image", "year": 1992},
    {"name": "Savage Dragon", "publisher": "Image", "year": 1993},
    {"name": "The Walking Dead", "publisher": "Image", "year": 2003},
    {"name": "Invincible", "publisher": "Image", "year": 2003},
    {"name": "Saga", "publisher": "Image", "year": 2012},
    {"name": "Witchblade", "publisher": "Image", "year": 1995},
    {"name": "The Darkness", "publisher": "Image", "year": 1996},
    {"name": "WildC.A.T.s", "publisher": "Image", "year": 1992},
    {"name": "Gen 13", "publisher": "Image", "year": 1995},
    {"name": "Chew", "publisher": "Image", "year": 2009},
    {"name": "East of West", "publisher": "Image", "year": 2013},
    {"name": "Paper Girls", "publisher": "Image", "year": 2015},
    {"name": "Monstress", "publisher": "Image", "year": 2015},
    {"name": "Something is Killing the Children", "publisher": "BOOM! Studios", "year": 2019},

    # ── Dark Horse ──────────────────────────────────────────────────────
    {"name": "Hellboy", "publisher": "Dark Horse Comics", "year": 1994},
    {"name": "Sin City", "publisher": "Dark Horse Comics", "year": 1991},
    {"name": "Usagi Yojimbo", "publisher": "Dark Horse Comics", "year": 1996},
    {"name": "B.P.R.D.", "publisher": "Dark Horse Comics", "year": 2003},

    # ── Valiant / IDW / others ──────────────────────────────────────────
    {"name": "X-O Manowar", "publisher": "Valiant", "year": 2012},
    {"name": "Bloodshot", "publisher": "Valiant", "year": 1993},
    {"name": "Harbinger", "publisher": "Valiant", "year": 1992},
    {"name": "Teenage Mutant Ninja Turtles", "publisher": "IDW Publishing", "year": 2011},
    {"name": "The Transformers", "publisher": "IDW Publishing", "year": 2009},
]
