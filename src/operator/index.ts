import { isListedAccount } from "@/auth/listed-email";

// The Operator is the app's developer, supporting Com-Install under an NDA: a signed-in account whose email is in
// OPERATOR_EMAILS (comma-separated) and confirmed. It's set only by that variable, never from inside the app, so an
// Admin can't remove it. With the variable unset, nobody is. The Operator area itself is ticket 09.
export function isOperator(
  account: { email: string; emailVerified: boolean } | null | undefined,
  operatorEmails: string | undefined = process.env.OPERATOR_EMAILS,
): boolean {
  return isListedAccount(account, operatorEmails);
}
