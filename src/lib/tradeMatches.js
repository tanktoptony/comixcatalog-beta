export function shapeTradeMatches(rows = [], bookMap = new Map(), profiles = new Map()) {
  const bookFor = (id) => bookMap.get(String(id)) ?? bookMap.get(Number(id));
  return rows.map((row) => {
    const theyHave = (row.they_have ?? []).map(bookFor).filter(Boolean);
    const youHave = (row.you_have ?? []).map(bookFor).filter(Boolean);
    const openIds = new Set((row.they_have_trade ?? []).map(String));
    const openToTrade = theyHave.filter((book) => openIds.has(String(book.id))).map((book) => book.id);
    const profile = profiles.get(row.member_id) ?? {};
    return {
      username: row.username,
      avatar_key: profile.avatar_key ?? null,
      avatar_url: profile.avatar_url ?? null,
      twoWay: theyHave.length > 0 && youHave.length > 0,
      theyHave,
      youHave,
      openToTrade,
      _tradeCount: openToTrade.length,
    };
  }).filter((match) => match.theyHave.length || match.youHave.length)
    .sort((a, b) => Number(b.twoWay) - Number(a.twoWay)
      || b._tradeCount - a._tradeCount
      || (b.theyHave.length + b.youHave.length) - (a.theyHave.length + a.youHave.length)
      || a.username.localeCompare(b.username))
    .map(({ _tradeCount, ...match }) => match);
}
