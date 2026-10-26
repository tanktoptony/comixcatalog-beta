export const DOSSIER_001 = {
  series: "THE POWER INDEX",
  designation: "POWER PROFILE",
  number: "001",
  name: "DOCTOR DOOM",
  realName: "VICTOR VON DOOM",
  homeland: "LATVERIA",
  firstAppearance: "FANTASTIC FOUR #5 (1962)",
  creators: "LEE / KIRBY",
  // FF #57 mask: Claude's pick, kept as the default (alternates: FF #5, Books of Doom 2025 TPB, Doom 2024 #1).
  art: { asset: "covers/fantastic-four-057-1966.jpg", focus: { x: 0.5, y: 1, zoom: 1.3 }, credit: "Cover art: Jack Kirby and Joe Sinnott, Fantastic Four #57 (1966)" },
  profileTag: "STANDARD ARMOR · BASELINE PROFILE",
  stats: [ // Marvel.com Power Grid, Victor von Doom profile. 1 to 7.
    { key: "intelligence", label: "INTELLIGENCE", value: 6 },
    { key: "strength", label: "STRENGTH", value: 4 },
    { key: "speed", label: "SPEED", value: 5 },
    { key: "durability", label: "DURABILITY", value: 6 },
    { key: "energy", label: "ENERGY PROJECTION", value: 6 },
    { key: "fighting", label: "FIGHTING SKILLS", value: 4 },
  ],
  statsSource: "Power grid: Marvel.com, Victor von Doom profile",
  sorcery: { label: "SORCERY", value: 5, note: "CC EDITORIAL" }, // Tony approved 5 (2026-10-26); null renders "UNRATED"
  bio: [
    "Scientist, sorcerer and monarch of Latveria.",
    "Expelled from State U after his own machine blew up in his face.",
    "Armored in Tibet, took Latveria's throne, still competing with Reed Richards.",
  ],
  equipment: ["Armor: force field, flight, gauntlet blasts", "Doombots (robot doubles)", "Time platform", "Mystic library and spellcraft"],
  essentials: ["Fantastic Four #5 (1962)", "Books of Doom #1-6 (2006)", "Triumph and Torment (1989)", "Fantastic Four #57-60 (1966-67)", "Secret Wars #1-9 (2015)"],
  // Marvel.com profile, physical traits.
  vitals: [["HEIGHT", "6'2\" · 6'7\" in armor"], ["WEIGHT", "226 lbs · 415 lbs in armor"]],
  contexts: ["STANDARD", "WITH A PLAN", "BORROWED POWER"],
  footer: ["CATALOG. COLLECT. CONNECT.", "COMIXCATALOG.COM"],
  overlays: {
    cosmic: { tag: "POWER COSMIC · TEMPORARY", source: "Fantastic Four #57-60", color: "#9fe3ff", values: { intelligence: 6, strength: 7, speed: 7, durability: 7, energy: 7, fighting: 4 } },
    beyonder: { tag: "BEYONDER POWER · TEMPORARY", source: "Secret Wars (1984) #10-12", color: "#d9c6ff", values: { intelligence: 7, strength: 7, speed: 7, durability: 7, energy: 7, fighting: 4 } },
    godEmperor: { tag: "GOD EMPEROR · TEMPORARY", source: "Secret Wars (2015)", color: "#f2c14e", values: { intelligence: 7, strength: 7, speed: 7, durability: 7, energy: 7, fighting: 4 } },
  },
  theme: "doom",
};
