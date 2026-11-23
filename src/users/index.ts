// Managing Users: an Admin changes a User's Role, deactivates or reactivates them, and moves a deactivated User's Job
// Cards to another Engineer. Every change is in the Audit Log. The Operator's account is never listed or changed here:
// it's set only by OPERATOR_EMAILS, so Com-Install can't lock out support by accident.

import { and, asc, count, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@/audit";
import type { Database } from "@/db";
import { jobCards, ROLES, session, user, type Role } from "@/db/schema";
import { isOperator } from "@/operator";

export type Result = { ok: true } | { error: string };

type Options = { operatorEmails?: string };
type Acting = Options & { actorUserId: string; asOperator?: boolean };
type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const NOT_FOUND = "That User can't be found. Reload the page.";
const lastAdmin = (name: string) => `${name} is the last active Admin. Make someone else an Admin first.`;

const operatorEmailsOf = (options: Options) => ("operatorEmails" in options ? options.operatorEmails : process.env.OPERATOR_EMAILS);
const isTheOperator = (account: { email: string; emailVerified: boolean }, options: Options) =>
  isOperator(account, operatorEmailsOf(options));

export type ListedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastSignInAt: Date | null;
  // How many Job Cards they own, in any Status.
  jobCards: number;
};

// Every User by name, active or not. Not the Operator.
export async function listUsers(db: Database, options: Options = {}): Promise<ListedUser[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      deactivatedAt: user.deactivatedAt,
      lastSignInAt: user.lastSignInAt,
      jobCards: count(jobCards.id),
    })
    .from(user)
    .leftJoin(jobCards, eq(jobCards.engineerId, user.id))
    .groupBy(user.id)
    .orderBy(asc(user.name), asc(user.email));
  return rows
    .filter((row) => !isTheOperator(row, options))
    .map(({ emailVerified: _verified, deactivatedAt, ...row }) => ({ ...row, active: !deactivatedAt }));
}

// Active Engineers by name: who a deactivated User's Job Cards can move to. Not the Operator.
export async function activeEngineers(db: Database, options: Options = {}) {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(and(eq(user.role, "engineer"), isNull(user.deactivatedAt)))
    .orderBy(asc(user.name), asc(user.email));
  return rows.filter((row) => !isTheOperator(row, options)).map(({ id, name }) => ({ id, name }));
}

// The User an Admin is acting on, or null for a missing id or the Operator.
async function subject(exec: Executor, userId: string, options: Options) {
  if (typeof userId !== "string" || !userId) return null;
  const [found] = await exec.select().from(user).where(eq(user.id, userId));
  if (!found || isTheOperator(found, options)) return null;
  return found;
}

// Whether taking this Admin away (demoting or deactivating) would leave no active Admin. Locks the active Admins'
// rows, so two Admins stepping down at the same moment can't both succeed. The Operator doesn't count.
async function wouldLeaveNoAdmin(tx: Executor, userId: string, options: Options) {
  const admins = await tx
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(and(eq(user.role, "admin"), isNull(user.deactivatedAt)))
    .for("update");
  const remaining = admins.filter((admin) => admin.id !== userId && !isTheOperator(admin, options));
  return admins.some((admin) => admin.id === userId) && remaining.length === 0;
}

export async function changeRole(db: Database, input: Acting & { userId: string; role: string }): Promise<Result> {
  const { actorUserId, asOperator, userId, role } = input;
  if (!(ROLES as readonly string[]).includes(role)) return { error: "Choose a Role: Engineer or Admin." };
  return db.transaction(async (tx): Promise<Result> => {
    const found = await subject(tx, userId, input);
    if (!found) return { error: NOT_FOUND };
    if (found.role === role) return { ok: true };
    if (role === "engineer" && (await wouldLeaveNoAdmin(tx, found.id, input))) return { error: lastAdmin(found.name) };
    await tx.update(user).set({ role: role as Role, updatedAt: new Date() }).where(eq(user.id, found.id));
    await recordAudit(tx, { actorUserId, asOperator, kind: "user_role_changed", subjectUserId: found.id, detail: { from: found.role, to: role } });
    return { ok: true };
  });
}

// Turns the account off and ends all its sessions at once. Their Job Cards stay, still theirs, until moved.
export async function deactivateUser(db: Database, input: Acting & { userId: string; now?: Date }): Promise<Result> {
  const { actorUserId, asOperator, userId, now = new Date() } = input;
  if (userId === actorUserId) return { error: "You can't deactivate yourself. Ask another Admin." };
  return db.transaction(async (tx): Promise<Result> => {
    const found = await subject(tx, userId, input);
    if (!found) return { error: NOT_FOUND };
    if (found.deactivatedAt) return { error: `${found.name} is already deactivated. Reload the page.` };
    if (found.role === "admin" && (await wouldLeaveNoAdmin(tx, found.id, input))) return { error: lastAdmin(found.name) };
    await tx.update(user).set({ deactivatedAt: now, updatedAt: now }).where(eq(user.id, found.id));
    await tx.delete(session).where(eq(session.userId, found.id));
    await recordAudit(tx, { actorUserId, asOperator, kind: "user_deactivated", subjectUserId: found.id });
    return { ok: true };
  });
}

export async function reactivateUser(db: Database, input: Acting & { userId: string }): Promise<Result> {
  const { actorUserId, asOperator, userId } = input;
  return db.transaction(async (tx): Promise<Result> => {
    const found = await subject(tx, userId, input);
    if (!found) return { error: NOT_FOUND };
    if (!found.deactivatedAt) return { error: `${found.name} is already active. Reload the page.` };
    await tx.update(user).set({ deactivatedAt: null, updatedAt: new Date() }).where(eq(user.id, found.id));
    await recordAudit(tx, { actorUserId, asOperator, kind: "user_reactivated", subjectUserId: found.id });
    return { ok: true };
  });
}

// Moves every Job Card of a deactivated User, in any Status, to an active Engineer. Each move is in the Audit Log.
export async function reassignJobCards(
  db: Database,
  input: Acting & { fromUserId: string; toUserId: string },
): Promise<{ ok: true; count: number } | { error: string }> {
  const { actorUserId, asOperator, fromUserId, toUserId } = input;
  return db.transaction(async (tx) => {
    const from = await subject(tx, fromUserId, input);
    if (!from) return { error: NOT_FOUND };
    if (!from.deactivatedAt) return { error: `Deactivate ${from.name} before moving their Job Cards.` };
    const to = toUserId === from.id ? null : await subject(tx, toUserId, input);
    if (!to || to.deactivatedAt || to.role !== "engineer") return { error: "Choose an active Engineer to move the Job Cards to." };
    const moved = await tx
      .update(jobCards)
      .set({ engineerId: to.id, updatedAt: new Date() })
      .where(eq(jobCards.engineerId, from.id))
      .returning({ id: jobCards.id });
    if (moved.length === 0) return { error: `${from.name} has no Job Cards to move.` };
    for (const card of moved) {
      await recordAudit(tx, {
        actorUserId,
        asOperator,
        kind: "job_card_reassigned",
        jobCardId: card.id,
        subjectUserId: to.id,
        detail: { fromUserId: from.id, toUserId: to.id },
      });
    }
    return { ok: true as const, count: moved.length };
  });
}
