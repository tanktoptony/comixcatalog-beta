const clean = (value) => String(value ?? "").trim();

function bookLabel(comic) {
  return `${clean(comic?.series_title) || "Untitled"} #${clean(comic?.issue_number) || "?"}`;
}

function chooseCover(covers) {
  if (!covers.length) return null;
  const ordered = [...covers].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return ordered.find((cover) => cover.is_primary)?.image_path ?? ordered[0]?.image_path ?? null;
}

export function planComicCollectionLinks({
  collections = [],
  comics = [],
  gcdIssues = [],
  profiles = [],
  covers = [],
  existingLinks = [],
  blockedCollectionIds = [],
} = {}) {
  const comicById = new Map(comics.map((comic) => [comic.id, comic]));
  const issueIds = new Set(gcdIssues.map((issue) => Number(issue.gcd_id)).filter(Number.isInteger));
  const usernames = new Map(profiles.map((profile) => [profile.id, clean(profile.username) || profile.id]));
  const blocked = new Set(blockedCollectionIds);
  const coverRows = new Map();
  for (const cover of covers) {
    if (!coverRows.has(cover.comic_id)) coverRows.set(cover.comic_id, []);
    coverRows.get(cover.comic_id).push(cover);
  }

  const occupied = new Set(existingLinks
    .filter((row) => row.gcd_issue_id != null)
    .map((row) => `${row.user_id}:${Number(row.gcd_issue_id)}`));
  const changes = [];
  const skips = [];

  for (const row of collections) {
    const comic = comicById.get(row.comic_id);
    const target = Number(comic?.gcd_id);
    const entry = {
      collectionId: row.id,
      userId: row.user_id,
      username: usernames.get(row.user_id) ?? row.user_id,
      book: bookLabel(comic),
      from: `comic ${row.comic_id ?? "null"}`,
      to: Number.isInteger(target) && target > 0 ? `gcd-${target}` : "no GCD target",
    };

    let reason = null;
    if (!comic) reason = "comic_not_found";
    else if (comic.review_status !== "approved") reason = "comic_not_approved";
    else if (!Number.isInteger(target) || target <= 0) reason = "comic_has_no_gcd_id";
    else if (row.gcd_issue_id != null) reason = "already_linked";
    else if (blocked.has(row.id)) reason = "open_order";
    else if (!issueIds.has(target)) reason = "gcd_issue_not_found";
    else if (occupied.has(`${row.user_id}:${target}`)) reason = "collision";

    if (reason) {
      skips.push({ ...entry, reason });
      continue;
    }

    const update = { gcd_issue_id: target, comic_id: null };
    const personalCover = row.user_cover_url ? null : chooseCover(coverRows.get(row.comic_id) ?? []);
    if (personalCover) update.user_cover_url = personalCover;

    changes.push({
      ...entry,
      target,
      sourceComicId: row.comic_id,
      update,
      preserved: {
        condition: row.condition ?? null,
        grade_numeric: row.grade_numeric ?? null,
        slab_company: row.slab_company ?? null,
        slab_cert_number: row.slab_cert_number ?? null,
        variant_label: row.variant_label ?? null,
      },
      listingSync: row.status === "for_sale",
    });
    occupied.add(`${row.user_id}:${target}`);
  }

  return { changes, skips };
}
