// Who may create an account. Sign-ups are invite-only for good: an email may sign up only if it's in ADMIN_EMAILS
// (how the first Admin gets in) or has a pending Invitation. With ADMIN_EMAILS unset and no
// Invitations, nobody can. Existing accounts are never affected.

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { invitations, type Role } from "@/db/schema";
import { isListedEmail } from "./listed-email";

export const SIGNUPS_CLOSED_CODE = "SIGNUPS_CLOSED";
export const SIGNUPS_CLOSED_MESSAGE =
  "You need an invitation to use Com-Install Job Cards. Ask an Admin to invite you, then use the email address the invitation went to.";

type Env = Record<string, string | undefined>;

// The newest Invitation for this email that hasn't been accepted, cancelled or expired.
export async function pendingInvitation(db: Database, email: string, now = new Date()) {
  const [found] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.trim().toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.cancelledAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .orderBy(desc(invitations.createdAt))
    .limit(1);
  return found ?? null;
}

// The Role a new account gets, or null when the email may not sign up.
export async function roleForNewAccount(db: Database, email: string, env: Env = process.env, now = new Date()): Promise<Role | null> {
  if (isListedEmail(email, env.ADMIN_EMAILS)) return "admin";
  const invitation = await pendingInvitation(db, email, now);
  return invitation?.role ?? null;
}

// Marks the pending Invitation for this email accepted, if there is one.
export async function acceptInvitation(db: Database, email: string, now = new Date()) {
  const invitation = await pendingInvitation(db, email, now);
  if (!invitation) return null;
  await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id));
  return invitation;
}
