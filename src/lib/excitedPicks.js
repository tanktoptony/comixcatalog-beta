export const EXCITED_PICKS = [
  {
    key: "midnight",
    label: "Marvel",
    title: "Midnight Spider-Man, X-Men, Fantastic Four",
    seriesGcdIds: [240077, 240953, 240078],
    note: "Marvel's new horror line. Hickman on X-Men, Percy on Fantastic Four, and Peter Parker turned into an actual spider. Sleep is overrated.",
  },
  {
    key: "magneto",
    label: "Marvel",
    title: "Magneto: End of Days",
    status: "Coming February 2027",
    // Marvel's NYCC 2026 press art (Andrea Sorrentino, Cover A). Not in
    // ComicVine or GCD yet; swap to seriesGcdIds once the series exists.
    cover: "/img/upcoming/magneto-end-of-days-1.jpg",
    creators: [
      { slug: "brian-michael-bendis", name: "Brian Michael Bendis" },
      { slug: "andrea-sorrentino", name: "Andrea Sorrentino" },
    ],
    note: "Bendis and Sorrentino, eight issues, Magneto across his whole life. February 2027. Start clearing shelf space.",
  },
  {
    key: "mind-mgmt",
    label: "Oni Press",
    title: "Mind MGMT: New & Improved",
    seriesGcdIds: [239340],
    note: "Matt Kindt brought back the strangest spy book ever made. The first issues are print only, so go see your shop.",
  },
  {
    key: "forever-home",
    label: "Oni Press",
    title: "The Forever Home",
    seriesGcdIds: [240351],
    note: "Christian Ward and Sami Kivelä. A billionaire seals his family away while the world ends. Something gets in. #2 just landed.",
  },
  {
    key: "absolute-batman",
    label: "DC",
    title: "Absolute Batman",
    seriesGcdIds: [216143],
    note: "Still the book everyone argues about at the counter. Snyder and Dragotta, plus Snyder's Absolute backup in Batman of Two Worlds.",
    noteLink: {
      text: "Batman of Two Worlds",
      seriesGcdId: 239764,
    },
  },
  {
    key: "absolute-catwoman",
    label: "DC",
    title: "Absolute Catwoman",
    seriesGcdIds: [237099],
    note: "Che Grayson and Bengal's Selina. #1 went back to press for a second printing. The Absolute line keeps landing.",
  },
];

export function excitedSeriesGcdIds(picks = EXCITED_PICKS) {
  return [
    ...new Set(
      picks.flatMap((pick) => [
        ...(pick.seriesGcdIds ?? []),
        ...(pick.noteLink ? [pick.noteLink.seriesGcdId] : []),
      ])
    ),
  ];
}

export function resolveExcitedPicks(seriesByGcdId, picks = EXCITED_PICKS) {
  const resolved = picks.flatMap((pick) => {
    if (pick.status) {
      return [{ ...pick, series: [] }];
    }

    const series = (pick.seriesGcdIds ?? [])
      .map((gcdId) => seriesByGcdId.get(gcdId))
      .filter((row) => row?.cover);

    if (series.length === 0) return [];

    const noteLinkSeries = pick.noteLink
      ? seriesByGcdId.get(pick.noteLink.seriesGcdId)
      : null;

    return [{
      ...pick,
      series,
      noteLinkHref: noteLinkSeries?.id ? `/series/${noteLinkSeries.id}` : null,
    }];
  });

  return resolved.length >= 3 ? resolved : [];
}
