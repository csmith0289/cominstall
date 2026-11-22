// Who may create an account. Sign-ups are invite-only for good: an email may sign up only if it's in ADMIN_EMAILS
// (how the first Admin gets in) or it brings the token from a pending Invitation's link to that email. Knowing an
// invited address isn't enough: the link is what proves the invitee got the email. With ADMIN_EMAILS unset and no
// Invitations, nobody can. Existing accounts are never affected.

import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { invitations, type Role } from "@/db/schema";
import { isListedEmail } from "./listed-email";

export const SIGNUPS_CLOSED_CODE = "SIGNUPS_CLOSED";
export const SIGNUPS_CLOSED_MESSAGE =
  "You need an invitation to use Com-Install Job Cards. Ask an Admin to invite you, then open the link in your invitation email.";

type Env = Record<string, string | undefined>;

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

// Only the SHA-256 hash of an invitation token is stored.
export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

const isPending = (now: Date) =>
  and(isNull(invitations.acceptedAt), isNull(invitations.cancelledAt), gt(invitations.expiresAt, now));

// The newest Invitation for this email that hasn't been accepted, cancelled or expired.
export async function pendingInvitation(db: Database, email: string, now = new Date()) {
  const [found] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, normaliseEmail(email)), isPending(now)))
    .orderBy(desc(invitations.createdAt))
    .limit(1);
  return found ?? null;
}

// The pending Invitation this token belongs to, if it was sent to this email.
export async function pendingInvitationForToken(db: Database, email: string, token: string, now = new Date()) {
  const [found] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, hashInvitationToken(token)), eq(invitations.email, normaliseEmail(email)), isPending(now)));
  return found ?? null;
}

// The Role a new account gets, or null when the email may not sign up.
export async function roleForNewAccount(
  db: Database,
  email: string,
  env: Env = process.env,
  now = new Date(),
  invitationToken?: string,
): Promise<Role | null> {
  if (isListedEmail(email, env.ADMIN_EMAILS)) return "admin";
  if (!invitationToken) return null;
  const invitation = await pendingInvitationForToken(db, email, invitationToken, now);
  return invitation?.role ?? null;
}
