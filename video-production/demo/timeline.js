// Component reel: every segment type once, on the real Episode 001 covers.
// Not an edit and not editorial copy. Used to check the look and to verify
// rendering end to end. Assets resolve under public/episode-001/ by sharing
// that episode's id for lookups (see assetEpisodeId).

const c = (name) => `covers/${name}.jpg`;

export default {
  id: "demo",
  assetEpisodeId: "episode-001",
  compositionId: "ComponentReel",
  title: "ComixCatalog video component reel",
  duration: "1:16",
  segments: [
    {
      at: 0,
      type: "title",
      kicker: "ComixCatalog · component reel",
      title: "Video toolkit",
      sub: "Every segment type, on the real Episode 001 covers",
      assets: ["x-men-001-1963", "x-men-129-1980", "x-men-130-1980", "x-men-135-1980", "x-men-136-1980", "x-men-137-1980", "x-men-141-1981", "uncanny-x-men-142-1981", "uncanny-x-men-266-1990", "x-men-014-1992", "x-men-015-1992", "x-men-016-1993", "house-of-m-001-2005", "house-of-m-008-2005", "house-of-x-001-2019", "house-of-x-006-2019", "powers-of-x-001-2019", "powers-of-x-006-2019"].map(c),
    },
    { at: 6, type: "chapter", kicker: "type: chapter", title: "Chapter card", sub: "Narration-box styling on a Cyclops-blue field" },
    { at: 11, type: "cover", asset: c("x-men-001-1963"), treatment: "slowPush", kicker: "type: cover · slowPush", title: "The X-Men #1", sub: "1963" },
    { at: 18, type: "cover", asset: c("x-men-137-1980"), treatment: "panDown", kicker: "type: cover · panDown", title: "The X-Men #137", sub: "1980" },
    { at: 25, type: "cover", asset: c("x-men-141-1981"), treatment: "focus", focus: { x: 0.5, y: 0.55, zoom: 1.7 }, kicker: "type: cover · focus", title: "The X-Men #141", sub: "1981" },
    {
      at: 31,
      type: "pair",
      assets: [
        { asset: c("x-men-135-1980"), label: "#135", sub: "1980" },
        { asset: c("x-men-137-1980"), label: "#137", sub: "1980" },
      ],
    },
    { at: 38, type: "grid", assets: ["x-men-129-1980", "x-men-130-1980", "x-men-135-1980", "x-men-136-1980", "x-men-137-1980"].map(c), highlight: 4, kicker: "type: grid · highlight", title: "The X-Men #129-137" },
    { at: 44, type: "fan", assets: ["house-of-x-001-2019", "powers-of-x-001-2019", "house-of-x-006-2019", "powers-of-x-006-2019"].map(c), kicker: "type: fan", title: "House of X / Powers of X" },
    {
      at: 50,
      type: "shelf",
      kicker: "type: shelf",
      title: "Starter shelf",
      items: [
        { asset: c("x-men-129-1980"), label: "X-Men #129", sub: "1980" },
        { asset: c("x-men-141-1981"), label: "X-Men #141", sub: "1981" },
        { asset: c("x-men-014-1992"), label: "X-Men #14", sub: "1992" },
        { asset: c("house-of-m-001-2005"), label: "House of M #1", sub: "2005" },
        { asset: c("house-of-x-001-2019"), label: "House of X #1", sub: "2019" },
      ],
    },
    { at: 57, type: "quote", asset: c("uncanny-x-men-266-1990"), text: "Quote card: the line comes from the timeline", attribution: "type: quote" },
    { at: 62, type: "comixcatalog", title: "ComixCatalog card", sub: "With a site screenshot slot", screenshot: "screenshots/comixcatalog-issue-page.png" },
    { at: 66, type: "placeholder", asset: "tas/TAS_GAMBIT.jpg", label: "type: placeholder · an asset we do not have yet" },
    { at: 70, type: "end", title: "End card", sub: "Right half left clear for YouTube end-screen elements" },
  ],
};
