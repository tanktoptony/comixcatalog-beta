export const MESSAGE_URL_REGEX = /(?:https?:\/\/|www\.)\S+/i;

export function containsMessageUrl(body) {
  return typeof body === "string" && MESSAGE_URL_REGEX.test(body);
}
