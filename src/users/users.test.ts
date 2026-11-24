import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { auditLog, jobCards, session, user } from "@/db/schema";
import { activeEngineers, changeRole, deactivateUser, listUsers, reactivateUser, reassignJobCards } from "./index";

// Invented people only.
const OPERATOR_EMAILS = "support@example.test";

async function setUp() {
  const db = await createTestDatabase();
  const people = await db
    .insert(user)
    .values([
      { id: "admin-1", name: "Ada Admin", email: "ada@example.test", role: "admin", emailVerified: true },
      { id: "eng-1", name: "Ben Engineer", email: "ben@example.test", role: "engineer", emailVerified: true },
      { id: "eng-2", name: "Cy Engineer", email: "cy@example.test", role: "engineer", emailVerified: true },
      { id: "operator", name: "Support", email: "support@example.test", role: "admin", emailVerified: true },
    ])
    .returning();
  const options = { operatorEmails: OPERATOR_EMAILS };
  const audit = () => db.select().from(auditLog);
  const find = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!;
  const addSession = (userId: string) =>
    db.insert(session).values({ id: crypto.randomUUID(), token: crypto.randomUUID(), userId, expiresAt: new Date(Date.now() + 86_400_000) });
  const addJobCard = async (engineerId: string) =>
    (await db.insert(jobCards).values({ engineerId, jobDate: "2026-11-20" }).returning())[0]!;
  return { db, people, options, audit, find, addSession, addJobCard, admin: "admin-1" };
}

describe("listUsers", () => {
  it("lists every User with Role, active or not, last sign-in and Job Card count, and hides the Operator", async () => {
    const { db, options, addJobCard } = await setUp();
    const signedIn = new Date("2026-11-21T08:30:00Z");
    await db.update(user).set({ lastSignInAt: signedIn }).where(eq(user.id, "eng-1"));
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, "eng-2"));
    await addJobCard("eng-1");
    await addJobCard("eng-1");

    const listed = await listUsers(db, options);

    expect(listed.map((row) => row.name)).toEqual(["Ada Admin", "Ben Engineer", "Cy Engineer"]);
    expect(listed[1]).toMatchObject({ email: "ben@example.test", role: "engineer", active: true, lastSignInAt: signedIn, jobCards: 2 });
    expect(listed[2]).toMatchObject({ active: false, lastSignInAt: null, jobCards: 0 });
  });

  it("shows an unconfirmed account with an Operator email, since it isn't the Operator", async () => {
    const { db, options } = await setUp();
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, "operator"));
    expect((await listUsers(db, options)).map((row) => row.id)).toContain("operator");
  });
});

describe("changeRole", () => {
  it("makes an Engineer an Admin and audits it", async () => {
    const { db, options, audit, find, admin } = await setUp();
    expect(await changeRole(db, { ...options, actorUserId: admin, userId: "eng-1", role: "admin" })).toEqual({ ok: true });
    expect((await find("eng-1")).role).toBe("admin");
    expect(await audit()).toEqual([
      expect.objectContaining({ kind: "user_role_changed", actorUserId: admin, subjectUserId: "eng-1", asOperator: false, detail: { from: "engineer", to: "admin" } }),
    ]);
  });

  it("refuses a Role that isn't Engineer or Admin", async () => {
    const { db, options, audit, find, admin } = await setUp();
    const result = await changeRole(db, { ...options, actorUserId: admin, userId: "eng-1", role: "operator" });
    expect(result).toEqual({ error: "Choose a Role: Engineer or Admin." });
    expect((await find("eng-1")).role).toBe("engineer");
    expect(await audit()).toEqual([]);
  });

  it("changes nothing and audits nothing when the Role is already that", async () => {
    const { db, options, audit, admin } = await setUp();
    expect(await changeRole(db, { ...options, actorUserId: admin, userId: "eng-1", role: "engineer" })).toEqual({ ok: true });
    expect(await audit()).toEqual([]);
  });

  it("won't make the last active Admin an Engineer, even though the Operator is an Admin too", async () => {
    const { db, options, audit, find, admin } = await setUp();
    const result = await changeRole(db, { ...options, actorUserId: admin, userId: admin, role: "engineer" });
    expect(result).toEqual({ error: "Ada Admin is the last active Admin. Make someone else an Admin first." });
    expect((await find(admin)).role).toBe("admin");
    expect(await audit()).toEqual([]);
  });

  it("lets an Admin step down when another active Admin remains", async () => {
    const { db, options, find, admin } = await setUp();
    await changeRole(db, { ...options, actorUserId: admin, userId: "eng-1", role: "admin" });
    expect(await changeRole(db, { ...options, actorUserId: admin, userId: admin, role: "engineer" })).toEqual({ ok: true });
    expect((await find(admin)).role).toBe("engineer");
  });

  it("doesn't count a deactivated Admin as one that remains", async () => {
    const { db, options, admin } = await setUp();
    await db.update(user).set({ role: "admin", deactivatedAt: new Date() }).where(eq(user.id, "eng-1"));
    const result = await changeRole(db, { ...options, actorUserId: admin, userId: admin, role: "engineer" });
    expect(result).toEqual({ error: expect.stringContaining("last active Admin") });
  });

  it("can't touch the Operator or a User that doesn't exist", async () => {
    const { db, options, audit, find, admin } = await setUp();
    for (const userId of ["operator", "nobody", ""]) {
      expect(await changeRole(db, { ...options, actorUserId: admin, userId, role: "engineer" })).toEqual({
        error: "That User can't be found. Reload the page.",
      });
    }
    expect((await find("operator")).role).toBe("admin");
    expect(await audit()).toEqual([]);
  });
});

describe("deactivateUser", () => {
  it("turns the account off, ends their sessions at once, keeps their Job Cards, and audits it", async () => {
    const { db, options, audit, find, addSession, addJobCard, admin } = await setUp();
    await addSession("eng-1");
    await addSession("eng-1");
    await addSession("eng-2");
    const card = await addJobCard("eng-1");
    const now = new Date("2026-11-23T09:00:00Z");

    expect(await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1", now })).toEqual({ ok: true });

    expect((await find("eng-1")).deactivatedAt).toEqual(now);
    expect(await db.select().from(session).where(eq(session.userId, "eng-1"))).toEqual([]);
    expect(await db.select().from(session).where(eq(session.userId, "eng-2"))).toHaveLength(1);
    expect(await db.select().from(jobCards)).toEqual([expect.objectContaining({ id: card.id, engineerId: "eng-1" })]);
    expect(await audit()).toEqual([expect.objectContaining({ kind: "user_deactivated", actorUserId: admin, subjectUserId: "eng-1" })]);
  });

  it("won't let an Admin deactivate themselves", async () => {
    const { db, options, audit, find, admin } = await setUp();
    await changeRole(db, { ...options, actorUserId: admin, userId: "eng-1", role: "admin" });
    const result = await deactivateUser(db, { ...options, actorUserId: admin, userId: admin });
    expect(result).toEqual({ error: "You can't deactivate yourself. Ask another Admin." });
    expect((await find(admin)).deactivatedAt).toBeNull();
    expect(await audit()).toHaveLength(1);
  });

  it("won't deactivate the last active Admin", async () => {
    const { db, options, find, admin } = await setUp();
    // Acting as someone else, such as the Operator (ticket 09).
    const result = await deactivateUser(db, { ...options, actorUserId: "operator", asOperator: true, userId: admin });
    expect(result).toEqual({ error: "Ada Admin is the last active Admin. Make someone else an Admin first." });
    expect((await find(admin)).deactivatedAt).toBeNull();
  });

  it("says so when the User is already deactivated, and changes nothing", async () => {
    const { db, options, audit, find, admin } = await setUp();
    const first = new Date("2026-11-22T09:00:00Z");
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1", now: first });
    const result = await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" });
    expect(result).toEqual({ error: "Ben Engineer is already deactivated. Reload the page." });
    expect((await find("eng-1")).deactivatedAt).toEqual(first);
    expect(await audit()).toHaveLength(1);
  });

  it("can't deactivate the Operator", async () => {
    const { db, options, find, admin } = await setUp();
    expect(await deactivateUser(db, { ...options, actorUserId: admin, userId: "operator" })).toEqual({
      error: "That User can't be found. Reload the page.",
    });
    expect((await find("operator")).deactivatedAt).toBeNull();
  });
});

describe("reactivateUser", () => {
  it("turns the account back on and audits it", async () => {
    const { db, options, audit, find, admin } = await setUp();
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" });
    expect(await reactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" })).toEqual({ ok: true });
    expect((await find("eng-1")).deactivatedAt).toBeNull();
    expect((await audit()).map((entry) => entry.kind)).toEqual(["user_deactivated", "user_reactivated"]);
  });

  it("says so when the User is already active", async () => {
    const { db, options, audit, admin } = await setUp();
    expect(await reactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" })).toEqual({
      error: "Ben Engineer is already active. Reload the page.",
    });
    expect(await audit()).toEqual([]);
  });
});

describe("reassignJobCards", () => {
  it("moves every Job Card of a deactivated Engineer to an active Engineer, auditing each one", async () => {
    const { db, options, audit, addJobCard, admin } = await setUp();
    const cards = [await addJobCard("eng-1"), await addJobCard("eng-1")];
    const untouched = await addJobCard("eng-2");
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" });

    expect(await reassignJobCards(db, { ...options, actorUserId: admin, fromUserId: "eng-1", toUserId: "eng-2" })).toEqual({ ok: true, count: 2 });

    const rows = await db.select().from(jobCards);
    expect(rows.every((row) => row.engineerId === "eng-2")).toBe(true);
    expect(rows.map((row) => row.id).sort()).toEqual([...cards.map((card) => card.id), untouched.id].sort());
    const reassigned = (await audit()).filter((entry) => entry.kind === "job_card_reassigned");
    expect(reassigned.map((entry) => entry.jobCardId).sort()).toEqual(cards.map((card) => card.id).sort());
    expect(reassigned[0]).toMatchObject({ actorUserId: admin, detail: { fromUserId: "eng-1", toUserId: "eng-2" } });
  });

  it("only moves the Job Cards of a deactivated User", async () => {
    const { db, options, addJobCard, admin } = await setUp();
    await addJobCard("eng-1");
    const result = await reassignJobCards(db, { ...options, actorUserId: admin, fromUserId: "eng-1", toUserId: "eng-2" });
    expect(result).toEqual({ error: "Deactivate Ben Engineer before moving their Job Cards." });
    expect((await db.select().from(jobCards))[0]!.engineerId).toBe("eng-1");
  });

  it("only moves them to an active Engineer", async () => {
    const { db, options, addJobCard, admin } = await setUp();
    await addJobCard("eng-1");
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" });
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-2" });
    for (const toUserId of ["eng-2", "eng-1", admin, "operator", "nobody"]) {
      expect(await reassignJobCards(db, { ...options, actorUserId: admin, fromUserId: "eng-1", toUserId })).toEqual({
        error: "Choose an active Engineer to move the Job Cards to.",
      });
    }
    expect((await db.select().from(jobCards))[0]!.engineerId).toBe("eng-1");
  });

  it("says so when there are no Job Cards to move", async () => {
    const { db, options, audit, admin } = await setUp();
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-1" });
    expect(await reassignJobCards(db, { ...options, actorUserId: admin, fromUserId: "eng-1", toUserId: "eng-2" })).toEqual({
      error: "Ben Engineer has no Job Cards to move.",
    });
    expect((await audit()).filter((entry) => entry.kind === "job_card_reassigned")).toEqual([]);
  });
});

describe("activeEngineers", () => {
  it("lists active Engineers by name, never the Operator", async () => {
    const { db, options, admin } = await setUp();
    await deactivateUser(db, { ...options, actorUserId: admin, userId: "eng-2" });
    expect(await activeEngineers(db, options)).toEqual([{ id: "eng-1", name: "Ben Engineer" }]);
  });
});
