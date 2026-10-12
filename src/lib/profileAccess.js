export function getPrivateProfileView({
  exists,
  isPublic,
  viewerUsername,
  routeUsername,
}) {
  if (!exists) return "not-found";
  if (isPublic) return "public";

  const viewer = String(viewerUsername || "").trim().toLowerCase();
  const route = String(routeUsername || "").trim().toLowerCase();
  return viewer && viewer === route ? "owner" : "private";
}
