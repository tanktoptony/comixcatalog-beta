// Pure completeness rules for the seller's For sale shelf. Estimates are
// deliberately absent: only a price the seller saved completes a listing.
export function listingCompleteness(collections, listingsByCollection, photoCollectionIds) {
  const photos = photoCollectionIds instanceof Set ? photoCollectionIds : new Set(photoCollectionIds ?? []);
  const listed = (collections ?? []).filter((item) => item.status === "for_sale" && listingsByCollection?.[item.id]);
  const needsPrice = listed.filter((item) => listingsByCollection[item.id].price_cents == null);
  const needsPhoto = listed.filter((item) => !photos.has(item.id));
  return { listed, needsPrice, needsPhoto };
}
