import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "@/auth";
import { hashInvitationToken } from "@/auth/sign-up-rules";
import type { Database } from "@/db";
import { auditLog, invitations } from "@/db/schema";
import type { Email } from "@/email";
import { createTestDatabase } from "@/db/test-database";

// Invented test accounts, never real people.
const APP_URL = "http://localhost:3000";
const ADMIN = "admin@example.test";
const ENGINEER = "engineer@example.test";
const PASSWORD = "a long password 1";

// The request the action is handling, the auth and database it uses, and the emails it sends: set by each test.
let requestHeaders = new Headers();
let currentAuth: Auth;
let db: Database;
let sent: Email[] = [];

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
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

const { cancel, invite, resend } = await import("./actions");

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
});

// Signs up (the Engineer from an Invitation) and makes the next request carry that account's session cookie.
async function signUpAndUseSession(email: string) {
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
    body: { name: "Sam Test", email, password: PASSWORD, ...(email !== ADMIN && { invitationToken }) },
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
