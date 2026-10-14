export const FEEDBACK_RATINGS = {
  positive: 1,
  neutral: 0,
  negative: -1,
};

export function feedbackRatingValue(value) {
  return Object.hasOwn(FEEDBACK_RATINGS, value) ? FEEDBACK_RATINGS[value] : null;
}

export function feedbackRatingLabel(value) {
  if (value === 1) return "Positive";
  if (value === 0) return "Neutral";
  if (value === -1) return "Negative";
  return "";
}

export function formatSellerRating(rating) {
  if (!rating || Number(rating.count) <= 0 || rating.percent_positive == null) return "";
  return `${Math.round(Number(rating.percent_positive))}% positive (${Number(rating.count).toLocaleString("en-US")})`;
}
