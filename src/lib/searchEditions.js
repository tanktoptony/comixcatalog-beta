// One row per issue in search: a later printing or variant cover is dropped
// when its base issue is in the same results (a 2nd printing of Saga #1 with
// no date showed as a second plain "Saga #1", Adam, 2026-11-21). The issue
// page's version picker is where editions are chosen. A variant whose base
// isn't in the results stays, so nothing becomes unfindable.
export function baseEditions(issues) {
  const baseIds = new Set(
    issues.filter((i) => i.variant_of_gcd_id == null).map((i) => Number(i.gcd_id))
  );
  return issues.filter(
    (i) => i.variant_of_gcd_id == null || !baseIds.has(Number(i.variant_of_gcd_id))
  );
}
