// Emails in a comma-separated list from an environment variable. Emails compare in any case, with spaces around the
// commas ignored; a plus-address only matches itself. An unset or empty list holds nobody.
export function emailsIn(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isListedEmail(email: string, list: string | undefined): boolean {
  return emailsIn(list).includes(email.trim().toLowerCase());
}

// Whether a signed-in account's email is in the list, and confirmed.
export function isListedAccount(account: { email: string; emailVerified: boolean } | null | undefined, list: string | undefined): boolean {
  if (!account?.emailVerified) return false;
  return isListedEmail(account.email, list);
}
