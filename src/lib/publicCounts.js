export function publicCounts(row, min = 3) {
  if (!row) return null;
  const visible = (value) => Number.isInteger(Number(value)) && Number(value) >= min ? Number(value) : null;
  const result = {
    have: visible(row.have),
    want: visible(row.want),
    for_sale: visible(row.for_sale),
    updated_at: row.updated_at ?? null,
  };
  return result.have == null && result.want == null && result.for_sale == null ? null : result;
}
