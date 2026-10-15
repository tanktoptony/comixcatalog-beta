export const NORMALIZE_EMAIL_TEST_VECTORS = Object.freeze([
  { input: " Collector+first@Example.com ", expected: "collector@example.com" },
  { input: "you+1@gmail.com", expected: "you@gmail.com" },
  { input: "y.o.u@gmail.com", expected: "you@gmail.com" },
  { input: "Y.O.U+news@GoogleMail.com", expected: "you@gmail.com" },
  { input: "first.last+tag@outlook.com", expected: "first.last@outlook.com" },
]);

export function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replaceAll(".", "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}
