// Pure helpers for the collection value chart (src/components/ValueHistoryChart.js).
// Rows are collection_value_history: { snapshot_date: "YYYY-MM-DD", total_value, owned_count }.

// The last N days of rows ("30", "90"), or everything ("all").
export function rangeSlice(rows, range) {
  if (!rows.length || range === "all") return rows;
  const days = Number(range);
  if (!Number.isFinite(days)) return rows;
  const last = new Date(`${rows[rows.length - 1].snapshot_date}T00:00:00Z`);
  const cutoff = new Date(last.getTime() - days * 86400000).toISOString().slice(0, 10);
  return rows.filter((r) => r.snapshot_date >= cutoff);
}

// Change from the first row in range to the live value (or the last row when
// there's no live value yet). null with fewer than one row.
export function valueChange(rows, currentValue) {
  if (!rows.length) return null;
  const start = Number(rows[0].total_value) || 0;
  const live = Number(currentValue);
  const end = Number.isFinite(live) && currentValue != null ? live : Number(rows[rows.length - 1].total_value) || 0;
  return {
    from: rows[0].snapshot_date,
    delta: end - start,
    pct: start > 0 ? ((end - start) / start) * 100 : null,
  };
}

// Rows -> SVG points inside a W x H box. The y-range pads 10% so a flat line
// sits mid-chart instead of on the floor.
export function chartPoints(rows, { W, H, PAD }) {
  if (!rows.length) return [];
  const vals = rows.map((r) => Number(r.total_value) || 0);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, hi * 0.1);
  lo -= span * 0.1;
  hi += span * 0.1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  return rows.map((r, i) => ({
    row: r,
    x: PAD.left + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW),
    y: PAD.top + (1 - ((Number(r.total_value) || 0) - lo) / (hi - lo)) * innerH,
  }));
}

// Append (or replace today's row with) the live value so the line ends where
// the header number is. Rows stay untouched when there's no live value.
export function withLivePoint(rows, currentValue, today = new Date().toISOString().slice(0, 10)) {
  if (currentValue == null || !Number.isFinite(Number(currentValue)) || !rows.length) return rows;
  const last = rows[rows.length - 1];
  const live = { snapshot_date: today, total_value: Number(currentValue), owned_count: last.owned_count, live: true };
  return last.snapshot_date >= today ? [...rows.slice(0, -1), live] : [...rows, live];
}
