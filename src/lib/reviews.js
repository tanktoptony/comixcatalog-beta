export const REVIEW_MAX_LENGTH = 2000;

export function validateReviewInput(input) {
  const issueId = typeof input?.issue === "string" && /^\d+$/.test(input.issue.trim()) ? Number(input.issue) : input?.issue;
  if (!Number.isInteger(issueId) || issueId <= 0) return { error: "Invalid issue." };
  const rating = typeof input?.rating === "string" && /^\d+$/.test(input.rating.trim()) ? Number(input.rating) : input?.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5 stars." };
  if (input?.body != null && typeof input.body !== "string") return { error: "Review must be text." };
  const body = (input?.body ?? "").trim().replace(/\n{3,}/g, "\n\n") || null;
  if (body?.length > REVIEW_MAX_LENGTH) return { error: "Reviews can be up to 2,000 characters." };
  return { value: { issueId, rating, body } };
}

export function summarizeRatings(ratings) {
  const valid = (ratings ?? []).filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 5);
  const histogram = [0, 0, 0, 0, 0];
  for (const rating of valid) histogram[rating - 1] += 1;
  return { count: valid.length, average: valid.length ? Math.round((valid.reduce((sum, rating) => sum + rating, 0) / valid.length) * 10) / 10 : null, histogram };
}

export function orderReviews(reviews, { viewerId, followedIds = [], blockedIds = [] } = {}) {
  const viewer = viewerId == null ? null : String(viewerId);
  const followed = new Set(followedIds.map(String));
  const blocked = new Set(blockedIds.map(String));
  const group = (review) => String(review.user_id) === viewer ? 0 : followed.has(String(review.user_id)) ? 1 : 2;
  return [...(reviews ?? [])].filter((review) => !blocked.has(String(review.user_id))).sort((a, b) =>
    group(a) - group(b) || Number(Boolean(b.body)) - Number(Boolean(a.body)) || String(b.created_at).localeCompare(String(a.created_at))
  );
}

export function starsLabel(rating) { return `${rating} out of 5 stars`; }
