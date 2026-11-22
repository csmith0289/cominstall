// Invitations: an Admin offers an account to an email address, with the Role it will have. The invitee opens the
// link in the email, sets their name and password, and is signed in (src/auth). Every change is in the Audit Log.

import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@/audit";
import { hashInvitationToken, normaliseEmail, pendingInvitation } from "@/auth/sign-up-rules";
import type { Database } from "@/db";
import { invitations, ROLES, user, type Role } from "@/db/schema";
import type { Mailer } from "@/email";
import { invitationMessage } from "./email";

export const INVITATION_LIFETIME_DAYS = 7;
const LIFETIME_MS = INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

// Where the invitation link opens.
export const INVITATION_PATH = "/invitation";

export type Invitation = typeof invitations.$inferSelect;
export type Result = { ok: true } | { error: string };

type Sending = { actorUserId: string; appUrl: string | undefined; mailer: Mailer; now?: Date };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

const newToken = () => randomBytes(32).toString("base64url");
const linkFor = (appUrl: string | undefined, token: string) => `${appUrl ?? ""}${INVITATION_PATH}?token=${encodeURIComponent(token)}`;

// A failed send is logged, not thrown: the Invitation stands, and the Admin can resend it.
async function sendInvitation(mailer: Mailer, appUrl: string | undefined, invitation: { email: string; role: Role }, token: string) {
  try {
    await mailer({ to: invitation.email, ...invitationMessage(linkFor(appUrl, token), invitation.role) });
  } catch (error) {
    console.error(error);
  }
}

export async function inviteUser(
  db: Database,
  { email: typed, role, actorUserId, appUrl, mailer, now = new Date() }: Sending & { email: string; role: string },
): Promise<Result> {
  const email = normaliseEmail(typed);
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) return { error: "Enter a valid email address." };
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a Role: Engineer or Admin." };
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing) return { error: `${email} already has an account.` };
  if (await pendingInvitation(db, email, now)) {
    return { error: `${email} already has a pending Invitation. Resend or cancel it below.` };
  }
  const token = newToken();
  await db.transaction(async (tx) => {
    // An expired Invitation left open for this email is replaced by the new one.
    await tx
      .update(invitations)
      .set({ cancelledAt: now })
      .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)));
    const [created] = await tx
      .insert(invitations)
      .values({
        email,
        role: role as Role,
        tokenHash: hashInvitationToken(token),
        invitedByUserId: actorUserId,
        expiresAt: new Date(now.getTime() + LIFETIME_MS),
        createdAt: now,
      })
      .returning();
    await recordAudit(tx, { actorUserId, kind: "invitation_sent", detail: { invitationId: created!.id, email, role } });
  });
  await sendInvitation(mailer, appUrl, { email, role: role as Role }, token);
  return { ok: true };
}

// Invitations not yet accepted or cancelled, pending or expired, oldest first.
export async function openInvitations(db: Database) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)))
    .orderBy(asc(invitations.createdAt));
}

async function openInvitation(db: Database, invitationId: string) {
  const [found] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)));
  return found ?? null;
}

const NOT_OPEN = "That Invitation has already been accepted or cancelled. Reload the page.";

// A new link, valid for another 7 days; the old link stops working. Works on an expired Invitation too.
export async function resendInvitation(
  db: Database,
  { invitationId, actorUserId, appUrl, mailer, now = new Date() }: Sending & { invitationId: string },
): Promise<Result> {
  const invitation = await openInvitation(db, invitationId);
  if (!invitation) return { error: NOT_OPEN };
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + LIFETIME_MS) })
      .where(eq(invitations.id, invitation.id));
    await recordAudit(tx, {
      actorUserId,
      kind: "invitation_resent",
      detail: { invitationId: invitation.id, email: invitation.email, role: invitation.role },
    });
  });
  await sendInvitation(mailer, appUrl, invitation, token);
  return { ok: true };
}

export async function cancelInvitation(
  db: Database,
  { invitationId, actorUserId, now = new Date() }: { invitationId: string; actorUserId: string; now?: Date },
): Promise<Result> {
  const invitation = await openInvitation(db, invitationId);
  if (!invitation) return { error: NOT_OPEN };
  await db.transaction(async (tx) => {
    await tx.update(invitations).set({ cancelledAt: now }).where(eq(invitations.id, invitation.id));
    await recordAudit(tx, {
      actorUserId,
      kind: "invitation_cancelled",
      detail: { invitationId: invitation.id, email: invitation.email, role: invitation.role },
    });
  });
  return { ok: true };
}

export type LinkState =
  | { state: "pending"; invitation: Invitation }
  | { state: "expired" }
  // Accepted, cancelled, replaced by a resend, or never issued: all read the same to the person holding it.
  | { state: "used" };

// What an invitation link leads to. The token comes straight from the URL, so it may be missing or repeated (an array).
export async function invitationForLink(db: Database, token: string | string[] | undefined, now = new Date()): Promise<LinkState> {
  if (typeof token !== "string" || !token) return { state: "used" };
  const [found] = await db.select().from(invitations).where(eq(invitations.tokenHash, hashInvitationToken(token)));
  if (!found || found.acceptedAt || found.cancelledAt) return { state: "used" };
  if (found.expiresAt <= now) return { state: "expired" };
  return { state: "pending", invitation: found };
}

// Marks the Invitation behind this token accepted by the new account, and records it. Called once the account exists.
export async function markInvitationAccepted(db: Database, { token, userId, now = new Date() }: { token: string; userId: string; now?: Date }) {
  const link = await invitationForLink(db, token, now);
  if (link.state !== "pending") return;
  const { invitation } = link;
  await db.transaction(async (tx) => {
    await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id));
    await recordAudit(tx, {
      actorUserId: userId,
      kind: "invitation_accepted",
      subjectUserId: userId,
      detail: { invitationId: invitation.id, email: invitation.email, role: invitation.role },
    });
  });
}
