const GENERIC_WORDS = new Set([
  "cover", "variant", "edition", "comic", "comics", "issue", "the", "a", "an",
  "of", "by", "and", "printing", "print",
]);

function tokens(value, seriesTitle = "") {
  const seriesWords = new Set(String(seriesTitle).toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return (String(value).toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !GENERIC_WORDS.has(word))
    .filter((word) => !seriesWords.has(word))
    .filter((word) => !/^[a-z]$/.test(word) && !/^\d+$/.test(word));
}

// Cover rows are incomplete historical data, so only make a link when the
// database says it explicitly or the caption identifies exactly one edition.
export function matchVariantCovers(versions, images, { baseGcdId = null, seriesTitle = "" } = {}) {
  const rows = (versions ?? []).map((version) => ({
    version,
    tokens: new Set(tokens(version.name, seriesTitle)),
  }));

  return (images ?? []).map((image) => {
    const exact = rows.find(({ version }) =>
      Number(version.gcdId) !== Number(baseGcdId)
      && Number(image.gcdIssueId) === Number(version.gcdId)
    );
    if (exact) return { ...image, versionGcdId: exact.version.gcdId, version: exact.version };

    // Every distinctive word of the edition name has to be in the caption.
    // One shared word is not enough: "Cover A - Ryan Ottley" must not claim a
    // "Ryan Stegman Variant" image just because both say Ryan. A wrong link
    // would send the reader to the wrong edition, which is worse than none.
    const captionTokens = new Set(tokens(image.caption, seriesTitle));
    const matches = captionTokens.size
      ? rows.filter(({ tokens: versionTokens }) => versionTokens.size > 0 && [...versionTokens].every((word) => captionTokens.has(word)))
      : [];
    if (matches.length !== 1) return { ...image, versionGcdId: null, version: null };
    return { ...image, versionGcdId: matches[0].version.gcdId, version: matches[0].version };
  });
}

export function cleanVariantCaption(caption) {
  return String(caption ?? "").replace(/\s+/g, " ").trim() || "Variant cover";
}

const isCoverStory = (story) => /\bcover\b/i.test(String(story?.type ?? ""));
const isCoverCredit = (credit) => /\bcover\b/i.test(String(credit?.role ?? ""));

// GCD usually indexes a variant as its own issue holding only the variant's
// cover. Showing those rows alone would wipe the writer and interior artists,
// so the base issue's interior stays and only the cover part is swapped. A
// variant indexed with its full contents (some later printings) is used as is.
export function mergeEditionContents(base, edition) {
  if (!edition || edition === base) return base ?? edition ?? null;
  const pick = (baseRows = [], editionRows = [], isCover) => {
    if (!editionRows?.length) return baseRows ?? [];
    if (editionRows.some((row) => !isCover(row))) return editionRows;
    return [...editionRows, ...(baseRows ?? []).filter((row) => !isCover(row))];
  };
  const editionHasFullStories = (edition.stories ?? []).some((story) => !isCoverStory(story));
  return {
    credits: pick(base?.credits, edition.credits, isCoverCredit),
    stories: pick(base?.stories, edition.stories, isCoverStory),
    ad_pages_count: editionHasFullStories ? edition.ad_pages_count ?? 0 : base?.ad_pages_count ?? 0,
  };
}
