import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "@/auth";
import { hashInvitationToken } from "@/auth/sign-up-rules";
import type { Database } from "@/db";
import { eq } from "drizzle-orm";
import { auditLog, invitations, jobCards, session, user } from "@/db/schema";
import type { Email } from "@/email";
import { createTestDatabase } from "@/db/test-database";

// Invented test accounts, never real people.
const APP_URL = "http://localhost:3000";
const ADMIN = "admin@example.test";
const ENGINEER = "engineer@example.test";
const SECOND_ENGINEER = "second.engineer@example.test";
const PASSWORD = "a long password 1";

// The request the action is handling, the auth and database it uses, and the emails it sends: set by each test.
let requestHeaders = new Headers();
let currentAuth: Auth;
let db: Database;
let sent: Email[] = [];

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth")>()),
  getAuth: async () => currentAuth,
}));
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDatabase: async () => db,
}));
vi.mock("@/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/email")>()),
  createMailer: () => async (email: Email) => {
    sent.push(email);
  },
}));

const { cancel, changeUserRole, deactivate, invite, moveJobCards, reactivate, resend } = await import("./actions");
const { getSignedInUser } = await import("../../session");

beforeEach(async () => {
  db = await createTestDatabase();
  sent = [];
  const outboxDir = await mkdtemp(join(tmpdir(), "actions-outbox-"));
  const { createMailer: realMailer } = await vi.importActual<typeof import("@/email")>("@/email");
  currentAuth = createAuth(db, {
    appUrl: APP_URL,
    mailer: realMailer({ env: { EMAIL_OUTBOX_DIR: outboxDir }, log: () => {} }),
    env: { ADMIN_EMAILS: ADMIN },
  });
  requestHeaders = new Headers();
  revalidatePath.mockClear();
});

// Signs up (the Engineer from an Invitation) and makes the next request carry that account's session cookie.
async function signUpAndUseSession(email: string, name = "Sam Test") {
  const invitationToken = crypto.randomUUID();
  if (email !== ADMIN) {
    await db.insert(invitations).values({
      email,
      role: "engineer",
      tokenHash: hashInvitationToken(invitationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }
  const { headers } = await currentAuth.api.signUpEmail({
    body: { name, email, password: PASSWORD, ...(email !== ADMIN && { invitationToken }) },
    returnHeaders: true,
  });
  requestHeaders = new Headers({
    cookie: headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; "),
  });
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

// What next/navigation's notFound() and redirect() throw.
const notFound = { digest: expect.stringContaining("404") };
const redirectedToSignIn = { digest: expect.stringContaining("/sign-in") };

// An Invitation an Admin could resend or cancel.
async function pendingInvitationId() {
  const [row] = await db
    .insert(invitations)
    .values({
      email: "invitee@example.test",
      role: "engineer",
      tokenHash: hashInvitationToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();
  return row!.id;
}

describe("Admin → Users actions", () => {
  it("let an Admin invite, resend and cancel", async () => {
    await signUpAndUseSession(ADMIN);

    expect(await invite({}, form({ email: "new.engineer@example.test", role: "engineer" }))).toHaveProperty("notice");
    const id = await pendingInvitationId();
    expect(await resend({}, form({ invitationId: id }))).toHaveProperty("notice");
    expect(await cancel({}, form({ invitationId: id }))).toHaveProperty("notice");
    expect(sent.map((email) => email.to)).toEqual(["new.engineer@example.test", "invitee@example.test"]);
  });

  it("show a message, and keep the stale row on screen, when the Invitation is already gone", async () => {
    await signUpAndUseSession(ADMIN);
    const id = await pendingInvitationId();
    expect(await cancel({}, form({ invitationId: id }))).toHaveProperty("notice");
    revalidatePath.mockClear();

    // A second tab still shows the cancelled Invitation. Refreshing the page would unmount the row that shows the message.
    const gone = { error: "That Invitation has already been accepted or cancelled. Reload the page." };
    expect(await resend({}, form({ invitationId: id }))).toEqual(gone);
    expect(await cancel({}, form({ invitationId: id }))).toEqual(gone);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("give an Engineer a 404 and change nothing", async () => {
    await signUpAndUseSession(ENGINEER);
    const id = await pendingInvitationId();
    const before = { invitations: await db.select().from(invitations), audit: await db.select().from(auditLog) };

    await expect(invite({}, form({ email: "someone@example.test", role: "admin" }))).rejects.toMatchObject(notFound);
    await expect(resend({}, form({ invitationId: id }))).rejects.toMatchObject(notFound);
    await expect(cancel({}, form({ invitationId: id }))).rejects.toMatchObject(notFound);

    expect(await db.select().from(invitations)).toEqual(before.invitations);
    expect(await db.select().from(auditLog)).toEqual(before.audit);
    expect(sent).toEqual([]);
  });

  it("send anyone signed out to the sign-in page and change nothing", async () => {
    const id = await pendingInvitationId();

    await expect(invite({}, form({ email: "someone@example.test", role: "engineer" }))).rejects.toMatchObject(redirectedToSignIn);
    await expect(resend({}, form({ invitationId: id }))).rejects.toMatchObject(redirectedToSignIn);
    await expect(cancel({}, form({ invitationId: id }))).rejects.toMatchObject(redirectedToSignIn);

    expect(await db.select().from(invitations)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

// The id of the account a sign-up made.
const idOf = async (email: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0]!.id;

describe("Admin → Users: managing Users", () => {
  it("let an Admin change a Role, deactivate, move Job Cards and reactivate, each audited", async () => {
    await signUpAndUseSession(ENGINEER, "Eli Engineer");
    const engineerCookie = requestHeaders;
    await signUpAndUseSession(SECOND_ENGINEER, "Fay Engineer");
    await signUpAndUseSession(ADMIN);
    const adminCookie = requestHeaders;
    const engineer = await idOf(ENGINEER);
    const second = await idOf(SECOND_ENGINEER);
    await db.insert(jobCards).values({ engineerId: engineer, jobDate: "2026-11-20" });

    expect(await changeUserRole({}, form({ userId: second, role: "admin" }))).toEqual({ notice: "Fay Engineer is now an Admin." });
    expect(await changeUserRole({}, form({ userId: second, role: "engineer" }))).toEqual({ notice: "Fay Engineer is now an Engineer." });
    expect(await deactivate({}, form({ userId: engineer }))).toEqual({ notice: "Eli Engineer is deactivated and signed out everywhere." });

    // Their session ended at once.
    requestHeaders = engineerCookie;
    expect(await getSignedInUser()).toBeUndefined();
    expect(await db.select().from(session).where(eq(session.userId, engineer))).toEqual([]);
    requestHeaders = adminCookie;

    expect(await moveJobCards({}, form({ fromUserId: engineer, toUserId: second }))).toEqual({ notice: "Moved 1 Job Card to Fay Engineer." });
    expect((await db.select().from(jobCards))[0]!.engineerId).toBe(second);
    expect(await reactivate({}, form({ userId: engineer }))).toEqual({ notice: "Eli Engineer can sign in again." });
    const kinds = (await db.select().from(auditLog)).map((entry) => entry.kind).filter((kind) => !kind.startsWith("invitation"));
    expect(kinds).toEqual(["user_role_changed", "user_role_changed", "user_deactivated", "job_card_reassigned", "user_reactivated"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("show the refusal, and don't refresh, when an Admin tries to deactivate or demote themselves as the last Admin", async () => {
    await signUpAndUseSession(ADMIN);
    revalidatePath.mockClear();
    const self = await idOf(ADMIN);
    expect(await deactivate({}, form({ userId: self }))).toEqual({ error: "You can't deactivate yourself. Ask another Admin." });
    expect(await changeUserRole({}, form({ userId: self, role: "engineer" }))).toEqual({
      error: "Sam Test is the last active Admin. Make someone else an Admin first.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("send an Admin who makes themselves an Engineer to My Jobs", async () => {
    await signUpAndUseSession(SECOND_ENGINEER);
    await signUpAndUseSession(ADMIN);
    await changeUserRole({}, form({ userId: await idOf(SECOND_ENGINEER), role: "admin" }));
    await expect(changeUserRole({}, form({ userId: await idOf(ADMIN), role: "engineer" }))).rejects.toMatchObject({
      digest: expect.stringContaining("/jobs"),
    });
    expect((await db.select().from(user).where(eq(user.email, ADMIN)))[0]!.role).toBe("engineer");
  });

  it("give an Engineer a 404 and change nothing", async () => {
    await signUpAndUseSession(SECOND_ENGINEER);
    await signUpAndUseSession(ENGINEER);
    const second = await idOf(SECOND_ENGINEER);
    const before = { users: await db.select().from(user), audit: await db.select().from(auditLog) };

    await expect(changeUserRole({}, form({ userId: second, role: "admin" }))).rejects.toMatchObject(notFound);
    await expect(deactivate({}, form({ userId: second }))).rejects.toMatchObject(notFound);
    await expect(reactivate({}, form({ userId: second }))).rejects.toMatchObject(notFound);
    await expect(moveJobCards({}, form({ fromUserId: second, toUserId: second }))).rejects.toMatchObject(notFound);

    expect(await db.select().from(user)).toEqual(before.users);
    expect(await db.select().from(auditLog)).toEqual(before.audit);
  });

  it("send anyone signed out to the sign-in page and change nothing", async () => {
    await expect(changeUserRole({}, form({ userId: "x", role: "admin" }))).rejects.toMatchObject(redirectedToSignIn);
    await expect(deactivate({}, form({ userId: "x" }))).rejects.toMatchObject(redirectedToSignIn);
    await expect(reactivate({}, form({ userId: "x" }))).rejects.toMatchObject(redirectedToSignIn);
    await expect(moveJobCards({}, form({ fromUserId: "x", toUserId: "y" }))).rejects.toMatchObject(redirectedToSignIn);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});
