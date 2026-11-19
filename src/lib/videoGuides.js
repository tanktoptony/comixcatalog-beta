// How-to videos shown on /help, newest last. Tony records each one on the live
// site; add a row here once the video is public on YouTube. The section stays
// hidden while the list is empty.
//
// { youtubeId: "<11-char id from the YouTube URL>", title: "Scan your shelf", blurb: "Find an issue from its cover or barcode.", minutes: 3 }
export const VIDEO_GUIDES = [];

export function youtubeWatchUrl(id) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function youtubeThumbUrl(id) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}
