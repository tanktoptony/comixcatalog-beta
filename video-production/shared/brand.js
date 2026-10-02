// ComixCatalog brand tokens for video. Values are the site's own, taken from
// src/app/globals.css (:root --x-* and the --cc-* dark UI palette) so a
// video frame and a site screenshot sit side by side without a color jump.

export const brand = {
  bg: "#090c11", // --cc-bg, near-black charcoal
  surface: "#11161d", // --cc-surface
  surface2: "#171d26", // --cc-surface-2
  line: "#2b3444", // --cc-line
  blue: "#0b1e6b", // --x-blue, the "Cyclops blue" of the logo
  blueBright: "#1f4ea8", // --cc-blue
  gold: "#f4d03f", // --x-gold
  goldMuted: "#d8b04b", // --cc-gold
  offwhite: "#fff9d6", // --x-offwhite, narration-box paper
  text: "#eef2f7", // --cc-text
  textMuted: "#a4aebb", // --cc-text-muted
  ink: "#000000", // --x-line, panel borders
  red: "#c4122f", // --x-red-burst; used only for dev placeholders
};

// Display face is Big Shoulders, the same family the site loads via
// next/font for its showcase surfaces. Body is Inter.
export const fonts = {
  display: "'Big Shoulders', 'Arial Narrow', sans-serif",
  body: "'Inter', system-ui, sans-serif",
};

export const VIDEO = { width: 1920, height: 1080, fps: 30 };

// Channel bumper in front of every episode (src/ChannelIntro.jsx): 8 beats
// of "Funkorama" plus the logo hold. Captions/chapters for an upload with
// the bumper shift by CHANNEL_INTRO.frames / VIDEO.fps.
export const CHANNEL_INTRO = { frames: 223 };
