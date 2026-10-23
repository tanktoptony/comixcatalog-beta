import { markSvg } from "./marks.js";

export function badgeSvgDataUrl(badge, foundingNumber) {
  const shape = badge.shape === "circle"
    ? '<circle cx="64" cy="64" r="60" fill="#0b1e5b"/><circle cx="64" cy="64" r="54" fill="#1644a8"/><circle cx="64" cy="64" r="57" fill="none" stroke="#f6cf2e" stroke-width="3" stroke-dasharray="4 3"/>'
    : badge.shape === "hex"
      ? '<path d="M64 4 116 34v60l-52 30-52-30V34Z" fill="#0b1e5b"/><path d="M64 11 110 38v52l-46 27-46-27V38Z" fill="#f6cf2e"/><path d="M64 8 113 36v56l-49 29-49-29V36Z" fill="none" stroke="#0b1e5b" stroke-width="3" stroke-dasharray="4 3"/>'
      : '<path d="M64 4 116 20v42c0 34-26 54-52 62-26-8-52-28-52-62V20Z" fill="#0b1e5b"/><path d="M64 11 110 25v37c0 30-23 48-46 55-23-7-46-25-46-55V25Z" fill="#1644a8"/><path d="M64 8 113 23v39c0 32-25 51-49 59-24-8-49-27-49-59V23Z" fill="none" stroke="#f6cf2e" stroke-width="3" stroke-dasharray="4 3"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${shape}${markSvg(badge, { foundingNumber, fontFamily: "Arial Narrow,Arial" })}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
