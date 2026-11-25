const SITE = "https://www.comixcatalog.com";

// Which of these issues show no cover to a member, asked of the live library
// route. A failed or partial answer stops the run: reading "no answer" as
// "blank" would widen it.
export async function blankOnSite(ids) {
  const blank = new Set();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = ids.slice(i, i + 400);
    const res = await fetch(`${SITE}/api/library-hydrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comic_ids: [], gcd_issue_ids: batch }),
    });
    if (!res.ok) throw new Error(`library-hydrate answered ${res.status}`);
    const { items } = await res.json();
    if (!items) throw new Error("library-hydrate answered without items");
    for (const id of batch) {
      const item = items[`gcd-${id}`];
      if (item && (!item.cover || /fallback/.test(item.cover))) blank.add(id);
    }
  }
  return blank;
}
