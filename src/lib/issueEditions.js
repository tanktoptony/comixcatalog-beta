function numberOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function resolveEditionRow(row, requestedGcdId) {
  const requested = numberOrNull(requestedGcdId);
  const edition = numberOrNull(row?.gcd_id) ?? requested;
  const base = numberOrNull(row?.base_gcd_issue_id) ?? edition;
  return { baseGcdId: base, editionGcdId: edition, hasEditionColumns: Boolean(row?.hasEditionColumns) };
}

export function redirectForEdition({ requestedGcdId, baseGcdId, editionGcdId, hasEditionColumns }) {
  const requested = numberOrNull(requestedGcdId);
  const base = numberOrNull(baseGcdId);
  const edition = numberOrNull(editionGcdId);
  if (!hasEditionColumns || !requested || !base || !edition || base === requested) return null;
  return `/issue/gcd-${base}?edition=${edition}`;
}

export function buildVersionRows(rows, baseGcdId) {
  const base = numberOrNull(baseGcdId);
  return (rows ?? [])
    .map((row) => ({
      gcdId: numberOrNull(row.gcd_id),
      name: row.variant_name || row.details?.variant_name || (numberOrNull(row.gcd_id) === base ? "Base edition" : "Variant edition"),
      onSaleDate: row.details?.on_sale_date ?? null,
      price: row.details?.price ?? null,
      barcode: row.details?.barcode ?? null,
      cover: row.cover ?? null,
    }))
    .filter((row) => row.gcdId)
    .sort((a, b) => {
      if (a.gcdId === base) return -1;
      if (b.gcdId === base) return 1;
      const dateOrder = String(a.onSaleDate ?? "9999").localeCompare(String(b.onSaleDate ?? "9999"));
      return dateOrder || a.gcdId - b.gcdId;
    });
}

export function orderReprintsUsFirst(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const aUs = String(a.countryCode ?? a.country_code ?? "").toUpperCase() === "US" ? 0 : 1;
    const bUs = String(b.countryCode ?? b.country_code ?? "").toUpperCase() === "US" ? 0 : 1;
    return aUs - bUs || String(b.year ?? "").localeCompare(String(a.year ?? ""));
  });
}
