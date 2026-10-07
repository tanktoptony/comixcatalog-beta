export function sectionBoundaries(files, durations) {
  if (files.length !== durations.length) throw new Error("files and durations must have the same length");
  let cursor = 0;
  return files.map((file, i) => {
    const duration = Number(durations[i]);
    if (!Number.isFinite(duration) || duration < 0) throw new Error(`invalid duration for ${file}`);
    const entry = { id: file.replace(/\.[^.]+$/, ""), file, start: +cursor.toFixed(3), end: +(cursor + duration).toFixed(3) };
    cursor += duration;
    return entry;
  });
}
