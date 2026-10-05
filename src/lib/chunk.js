// Split an array into consecutive pieces of at most `size` items.
export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("chunk size must be a positive integer");
  const out = [];
  for (let i = 0; i < (items?.length ?? 0); i += size) out.push(items.slice(i, i + size));
  return out;
}
