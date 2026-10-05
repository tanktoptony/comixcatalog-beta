"""Truth table for the done-ledger mark decision.

The ledger is the highest-consequence file in the ingest: a wrong entry
skips a target for free on every future run, forever, with no error and no
trace. Both known production incidents came from this one boolean, so it is
tested directly rather than inferred from a green pipeline run.

Run: python test_done_ledger.py
"""

import sys
from datetime import datetime, timedelta, timezone

from comicvine_api_to_supabase import _done_mark_blockers, _is_done_fresh, _load_done


def should_mark_done(attempts, successes, already_covered):
    stuck, nothing = _done_mark_blockers(attempts, successes, already_covered)
    return not (stuck or nothing)


CASES = [
    # (attempts, successes, already_covered, expected_mark_done, description)
    (
        0, 0, 0, False,
        "REGRESSION 2026-09-22: volume matched but produced nothing. This is "
        "how Starmasters, Robin II, G.I. Joe Comics Magazine and Fantastic "
        "Four: World's Greatest Comics Magazine were marked done with zero "
        "covers while sitting in the highest-priority ingest lane.",
    ),
    (
        0, 0, 12, True,
        "Every issue already covered by a prior run under --skip-existing. "
        "The one legitimate way to attempt nothing and still be finished.",
    ),
    (
        5, 0, 0, False,
        "REGRESSION 2026-08-09: attempted issues, every one failed (bad image "
        "URL, upload error, no GCD match). Reached the end without crashing, "
        "which used to look identical to success.",
    ),
    (
        5, 0, 3, False,
        "Same as above, but the volume had prior coverage. Prior coverage "
        "must not excuse a run in which every new attempt failed.",
    ),
    (5, 5, 0, True, "Every new issue landed a cover."),
    (5, 1, 0, True, "Partial success still counts — one cover is progress."),
    (1, 1, 99, True, "New cover on a volume that was already well covered."),
]


def main():
    failures = []
    for attempts, successes, already, expected, description in CASES:
        actual = should_mark_done(attempts, successes, already)
        status = "ok  " if actual == expected else "FAIL"
        if actual != expected:
            failures.append((attempts, successes, already, expected, actual, description))
        print(
            f"  {status} attempts={attempts} successes={successes} "
            f"already_covered={already} -> mark_done={actual} (expected {expected})"
        )
        print(f"       {description}")

    now = datetime.now(timezone.utc)
    iso = lambda days: (now - timedelta(days=days)).isoformat()
    ttl_cases = [
        ({"processed_at": iso(8), "latest_release_date": iso(10)}, False, "recent release, processed 8 days ago"),
        ({"processed_at": iso(6), "latest_release_date": iso(10)}, True, "recent release, processed 6 days ago"),
        ({"processed_at": iso(8), "latest_release_date": iso(90)}, True, "old release, processed 8 days ago"),
        ({"processed_at": iso(8)}, True, "missing release field uses 30-day TTL"),
    ]
    for entry, expected, description in ttl_cases:
        actual = _is_done_fresh({"target": entry}, "target", 30)
        print(f"  {'ok  ' if actual == expected else 'FAIL'} {description}: fresh={actual} (expected {expected})")
        if actual != expected:
            failures.append(description)

    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as directory:
        ledger = Path(directory) / "done.json"
        ledger.write_text('["legacy-key"]', encoding="utf-8")
        legacy = _load_done(str(ledger))
        actual = _is_done_fresh(legacy, "legacy-key", 30)
        print(f"  {'ok  ' if actual else 'FAIL'} legacy list format parses as fresh")
        if not actual:
            failures.append("legacy list format")

    print()
    if failures:
        print(f"FAILED: {len(failures)} of {len(CASES)} cases")
        return 1
    print(f"OK: {len(CASES) + len(ttl_cases) + 1} cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
