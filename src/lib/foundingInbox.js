// One rule for "this inbox already holds a founding pass": the SQL function
// founding_inbox_taken (migration 0076) normalizes +tags and Gmail dots the
// same way src/lib/normalizeEmail.js does, and claim_founding_pass applies it
// again under the cap lock. This preflight only gives a clear error early.
export async function foundingInboxIsClaimed(supabase, claimantId) {
  const { data, error } = await supabase.rpc("founding_inbox_taken", { p_user_id: claimantId });
  if (error) throw error;
  return data === true;
}
