// Whisper's spellings of Amory Wars names, fixed for captions (episode SRT
// and Shorts). Each rule matches a run of transcript tokens (lowercase,
// punctuation stripped) and replaces the run with one caption word that keeps
// the first word's start, the last word's end and the last word's trailing
// punctuation. Anchors keep using the raw transcript.

const RULES = [
  ["co heating cambria's", "Coheed and Cambria's"], ["co heating cambria", "Coheed and Cambria"], ["co heating", "Coheed and"], ["coheated in", "Coheed and"],
  ["co heed", "Coheed"], ["co heat", "Coheed"], ["coheats", "Coheed's"], ["comics catalog", "ComixCatalog"],
  ["juna song", "Junesong"], ["june song", "Junesong"], ["nuo ikken", "Newo Ikkin"], ["nuo icken", "Newo Ikkin"], ["nuo's", "Newo's"], ["nuo", "Newo"],
  ["godsend", "God Send"], ["kbi", "K.B.I."], ["krom", "Crom"], ["krom's", "Crom's"], ["velar", "Vielar"],
  ["glory of elvesa", "Gloria Vel Vessa"], ["glory of el vassa", "Gloria Vel Vessa"], ["i our robot", "IRO-bot"], ["ir robot", "IRO-Bot"], ["iro bot", "IRO-bot"],
  ["kilganan", "Kilgannon"], ["kilganons", "Kilgannons"], ["defton wolf", "Deftinwolf"], ["key work", "Keywork"], ["trimage", "Tri-Mage"],
  ["shabootie", "Shabütie"], ["here shot", "Hearshot"], ["never ender", "Neverender"], ["greever", "Griever"], ["and talaria", "Antillarea"],
  ["the first in kbi", "the I in K.B.I."], ["bag online", "Bag On Line"], ["evil inc", "Evil Ink"], ["vasquez", "Vazquez"], ["kelly", "Kelley"],
  ["second stage turbine blade", "Second Stage Turbine Blade"], ["amory wars", "Amory Wars"], ["heaven's fence", "Heaven's Fence"], ["god send conspirator", "God Send Conspirator"],
  ["junesong provision", "Junesong Provision"], ["time consumer", "Time Consumer"], ["everything evil", "Everything Evil"], ["delirium trigger", "Delirium Trigger"],
  ["coheed", "Coheed"], ["coheed's", "Coheed's"], ["cambria", "Cambria"], ["cambria's", "Cambria's"], ["claudio", "Claudio"], ["claudio's", "Claudio's"], ["josephine", "Josephine"],
  ["jesse", "Jesse"], ["jesse's", "Jesse's"], ["mariah", "Mariah"], ["monstar", "Monstar"], ["keywork", "Keywork"], ["inferno", "Inferno"], ["mayo", "Mayo"], ["mayo's", "Mayo's"],
  ["want list", "wantlist"], ["fiance", "fiancé"], ["spaceport", "space port"],
];
const tok = (w) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, "");
const RULE_TOKENS = RULES.map(([from, to]) => [from.split(" "), to]).sort((a, b) => b[0].length - a[0].length);

export function fixWords(words) {
  const out = [];
  for (let i = 0; i < words.length; ) {
    let done = false;
    for (const [from, to] of RULE_TOKENS) {
      if (from.every((t, k) => words[i + k] && tok(words[i + k].w) === t)) {
        const last = words[i + from.length - 1];
        const punct = (last.w.match(/[.,!?;:]+$/) ?? [""])[0];
        out.push({ ...words[i], w: to + punct, e: last.e });
        i += from.length;
        done = true;
        break;
      }
    }
    if (!done) out.push(words[i++]);
  }
  return out;
}
