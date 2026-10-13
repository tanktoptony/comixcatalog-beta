export function makeLibraryKey(item) {
  if (item?.gcd_issue_id != null) return `gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return String(item.comic_id);
  return null;
}

export function buildLibraryItems(collections, comicIndex, tab) {
  return collections.flatMap((item) => {
    const inTab = tab === "owned"
      ? item.status === "owned" || item.status === "for_sale"
      : item.status === tab;
    if (!inTab) return [];
    const libraryKey = makeLibraryKey(item);
    if (!libraryKey) return [];
    const hydratedComic = comicIndex[libraryKey];
    const comic = hydratedComic ?? {
      id: libraryKey, title: "…", issueNumber: "", year: null,
      publisher: "Unknown Publisher", rawPublisher: "Unknown Publisher",
      cover: "/fallback-cover.png",
    };
    return [{ ...item, libraryKey, hydrated: Boolean(hydratedComic), comic }];
  });
}

export function groupLibraryRows(items) {
  const groups = new Map();
  for (const item of items) {
    const comic = item.comic ?? {};
    const title = comic.title || "Untitled";
    const key = item.hydrated ? title : `unhydrated:${item.libraryKey}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, title, years: new Set(), publisher: comic.publisher, cover: null, items: [] };
      groups.set(key, group);
    }
    if (comic.year) group.years.add(Number(comic.year));
    group.items.push(item);
    if (!group.cover) group.cover = comic.cover || null;
  }
  return [...groups.values()];
}
