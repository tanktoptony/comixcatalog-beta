import csv
import uuid
import random

publishers = {
    "Marvel": [
        "Amazing Spider-Man",
        "X-Men",
        "Avengers",
        "Fantastic Four",
        "Daredevil"
    ],
    "DC": [
        "Batman",
        "Superman",
        "Justice League",
        "Detective Comics",
        "Wonder Woman"
    ],
    "Image": [
        "Saga",
        "Spawn",
        "Invincible",
        "The Walking Dead",
        "Savage Dragon"
    ],
    "Dark Horse": [
        "Hellboy",
        "Sin City",
        "Black Hammer"
    ],
    "Boom": [
        "Something is Killing the Children",
        "Power Rangers"
    ],
    "IDW": [
        "Teenage Mutant Ninja Turtles",
        "Transformers"
    ]
}

rows = []

for publisher, series_list in publishers.items():
    for series in series_list:
        issue_count = random.randint(200, 800)

        for i in range(1, issue_count + 1):
            rows.append({
                "id": str(uuid.uuid4()),
                "series_title": series,
                "issue_number": str(i),
                "publisher": publisher,
                "release_year": random.randint(1960, 2024),
                "variant_name": None,
                "created_by": None
            })

rows = rows[:100000]

with open("comics_seed.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=[
            "id",
            "series_title",
            "issue_number",
            "publisher",
            "release_year",
            "variant_name",
            "created_by"
        ]
    )

    writer.writeheader()
    writer.writerows(rows)

print("Generated comics_seed.csv with", len(rows), "rows")