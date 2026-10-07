export const mmss = (seconds) => {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function chaptersFromSections(config, sectionData, { strict = true } = {}) {
  const times = new Map((sectionData?.sections ?? sectionData ?? []).map((s) => [s.id, s.start]));
  return config.sections.filter((s) => s.chapter != null).flatMap((s) => {
    if (!times.has(s.id)) {
      if (strict) throw new Error(`No audio boundary found for chapter section ${s.id}`);
      return [];
    }
    return [{ label: s.chapter, at: Number(times.get(s.id)) }];
  });
}

export function chaptersFromTimeline(definitions, timeline) {
  const at = (beat) => timeline.segments.find((s) => s.beat === beat)?.at;
  return definitions.map(([beat, label]) => ({ label, at: beat ? at(beat) : 0 }));
}

export const chapterText = (chapters) => chapters.map((c) => `${mmss(c.at)} ${c.label}`).join("\n");
