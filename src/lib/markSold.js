const SOLD_VIA = new Set(["comixcatalog_message", "offsite"]);

export function validateMarkSold(body) {
  const collectionItemId = String(body?.collectionItemId ?? "").trim();
  const salePrice = Number(body?.salePrice);
  const soldVia = String(body?.soldVia ?? "");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(collectionItemId)) {
    return { error: "Choose a valid collection item." };
  }
  if (body?.salePrice === "" || body?.salePrice == null || !Number.isFinite(salePrice) || salePrice <= 0) {
    return { error: "Sale price must be greater than $0." };
  }
  if (salePrice > 99999999.99 || Math.abs(Math.round(salePrice * 100) - salePrice * 100) > 1e-8) {
    return { error: "Enter a valid sale price with no more than two decimal places." };
  }
  if (!SOLD_VIA.has(soldVia)) return { error: "Choose where the book sold." };
  return { value: { collectionItemId, salePrice, soldVia } };
}
