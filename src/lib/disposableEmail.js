const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "20minutemail.com", "33mail.com", "dispostable.com",
  "emailondeck.com", "fakeinbox.com", "getairmail.com", "getnada.com",
  "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.net",
  "guerrillamail.org", "guerrillamailblock.com", "inboxkitten.com", "mailcatch.com",
  "maildrop.cc", "mailinator.com", "mailinator.net", "mailnesia.com",
  "mailnull.com", "mailsac.com", "mintemail.com", "moakt.com", "mytemp.email",
  "nada.email", "sharklasers.com", "spam4.me", "spamgourmet.com", "temp-mail.io",
  "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.net", "tempmailo.com",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "yopmail.com", "yopmail.fr",
  "yopmail.net", "zemail.me",
]);

export function isDisposableEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@").pop();
  if (!domain || !String(email).includes("@")) return false;
  return [...DISPOSABLE_DOMAINS].some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}
