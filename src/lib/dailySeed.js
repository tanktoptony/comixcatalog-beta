// Day index for the homepage rotations (featured series, hero cover wall):
// days since 1970-01-01 on Chicago's calendar, so the mix changes at local
// midnight rather than at 7pm UTC. Same value for every request that day.
export function chicagoDayIndex(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
