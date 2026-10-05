function emptyPlan() {
  return { inserts: [], updates: [], deletes: [] };
}

function isCopy(row) {
  return row?.status === "owned" || row?.status === "for_sale";
}

export function planAdd(rows, { status }) {
  const plan = emptyPlan();
  const wishlist = rows.find((row) => row.status === "wishlist");
  const hasCopies = rows.some(isCopy);

  if (status === "wishlist") {
    if (!wishlist) plan.inserts.push({ status: "wishlist" });
    return plan;
  }

  if (hasCopies) {
    if (wishlist) plan.deletes.push(wishlist.id);
    return plan;
  }

  if (wishlist) {
    plan.updates.push({ id: wishlist.id, patch: { status: "owned" } });
  } else {
    plan.inserts.push({ status: "owned" });
  }
  return plan;
}

export function planRemove(rows, { scope, rowId } = {}) {
  const plan = emptyPlan();

  if (scope === "copy") {
    if (!rows.some((row) => row.id === rowId)) {
      throw new Error(`Collection row not found: ${rowId}`);
    }
    plan.deletes.push(rowId);
    return plan;
  }

  if (scope === "wishlist") {
    const wishlist = rows.find((row) => row.status === "wishlist");
    if (wishlist) plan.deletes.push(wishlist.id);
    return plan;
  }

  if (scope !== "latest-copy") {
    throw new Error(`Unknown remove scope: ${scope}`);
  }

  const owned = rows.filter((row) => row.status === "owned");
  const candidates = owned.length ? owned : rows.filter((row) => row.status === "for_sale");
  candidates.sort((a, b) => {
    const timeDiff = new Date(b.created_at || 0) - new Date(a.created_at || 0);
    return timeDiff || String(b.id).localeCompare(String(a.id));
  });
  if (candidates[0]) plan.deletes.push(candidates[0].id);
  return plan;
}

export function countCopies(rows) {
  return rows.filter(isCopy).length;
}

const inFlightKeys = new Set();

export async function withKeyLock(key, fn) {
  if (inFlightKeys.has(key)) return { ok: false, error: "busy" };
  inFlightKeys.add(key);
  try {
    return await fn();
  } finally {
    inFlightKeys.delete(key);
  }
}

export function nextCopyNumber(rows, variantLabel) {
  const matching = rows.filter(
    (row) => (row.variant_label ?? null) === (variantLabel ?? null)
  );
  if (!matching.length) return 1;
  return Math.max(...matching.map((row) => Number(row.copy_number) || 1)) + 1;
}
