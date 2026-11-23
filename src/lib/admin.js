export const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";

// Tony's test account (@test_tony). It can see private members, like the
// admin account, so Tony can check them from either login. It gets nothing
// else from admin: no Pro toggles, no review queue, no founder flag.
export const TEST_TONY_ID = "cd7c5065-c340-48f0-be34-e18b08b37b7e";

export const PRIVATE_MEMBER_VIEWER_IDS = Object.freeze([ADMIN_ID, TEST_TONY_ID]);

export function canSeePrivateMembers(userId) {
  return PRIVATE_MEMBER_VIEWER_IDS.includes(userId);
}
