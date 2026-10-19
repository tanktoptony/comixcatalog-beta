export function fitTitle(text = "") {
  const length = String(text).trim().length;
  if (length <= 22) return 70;
  if (length <= 38) return 58;
  if (length <= 58) return 48;
  return 40;
}

export function formatCountDown(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}M`;
  if (n >= 10_000) return `${Math.floor(n / 1_000)}K`;
  return Math.floor(n).toLocaleString("en-US");
}

export function coverLayout(count) {
  if (count <= 0) return { columns: 0, width: 0, height: 0 };
  if (count === 1) return { columns: 1, width: 260, height: 390 };
  if (count <= 5) return { columns: Math.min(count, 3), width: 142, height: 213 };
  return { columns: 4, width: 150, height: 225 };
}
