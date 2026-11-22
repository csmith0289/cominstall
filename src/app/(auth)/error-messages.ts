import { isAPIError } from "better-auth/api";
import { ACCOUNT_DEACTIVATED_CODE, ACCOUNT_DEACTIVATED_MESSAGE } from "@/auth/deactivated";
import { SIGNUPS_CLOSED_CODE, SIGNUPS_CLOSED_MESSAGE } from "@/auth/sign-up-rules";

// Our wording for the auth errors a User can cause; Better Auth's own messages talk about "users".
const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_EMAIL_FORMAT: "Enter a valid email address.",
  PASSWORD_TOO_SHORT: "Use a password of at least 8 characters.",
  PASSWORD_TOO_LONG: "Use a shorter password.",
  INVALID_TOKEN: "This link has expired or has already been used. Ask for a new one.",
  [SIGNUPS_CLOSED_CODE]: SIGNUPS_CLOSED_MESSAGE,
  [ACCOUNT_DEACTIVATED_CODE]: ACCOUNT_DEACTIVATED_MESSAGE,
};

export function authErrorMessage(error: unknown, fallback: string): string {
  const code = isAPIError(error) ? error.body?.code : undefined;
  // Better Auth's schema check reports a malformed email as a generic VALIDATION_ERROR naming the field.
  if (code === "VALIDATION_ERROR" && isAPIError(error) && error.body?.message?.includes("[body.email]")) {
    return "Enter a valid email address.";
  }
  return (code && MESSAGES[code]) || fallback;
}
