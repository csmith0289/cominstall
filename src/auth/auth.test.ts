import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { auditLog, invitations, session, user } from "@/db/schema";
import { createMailer, readOutbox } from "@/email";
import { ACCOUNT_DEACTIVATED_CODE, createAuth, SIGNUPS_CLOSED_MESSAGE } from "./index";
import { hashInvitationToken } from "./sign-up-rules";

const APP_URL = "http://localhost:3000";

async function setUp({ adminEmails }: { adminEmails?: string } = {}) {
  const db = await createTestDatabase();
  const outboxDir = await mkdtemp(join(tmpdir(), "auth-outbox-"));
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error("No network in tests");
  });
  const auth = createAuth(db, {
    appUrl: APP_URL,
    mailer: createMailer({ env: { EMAIL_OUTBOX_DIR: outboxDir }, fetch, log: () => {} }),
    env: { ADMIN_EMAILS: adminEmails },
  });
  const signUp = (email: string, invitationToken?: string) =>
    auth.api.signUpEmail({
      body: { name: "Sam Engineer", email, password: "a long password 1", callbackURL: "/confirm-email", ...(invitationToken && { invitationToken }) },
    });
  const signIn = (email: string, password = "a long password 1") => auth.api.signInEmail({ body: { email, password } });
  const findUser = async (email: string) => (await db.select().from(user).where(eq(user.email, email)))[0];
  // Returns the token the invitation link would carry.
  const invite = async (email: string, role: "engineer" | "admin" = "engineer") => {
    const token = crypto.randomUUID();
    await db.insert(invitations).values({
      email,
      role,
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return token;
  };
  return { db, auth, signUp, signIn, findUser, invite, outboxDir };
}

const refused = { status: "FORBIDDEN", body: { code: "SIGNUPS_CLOSED", message: SIGNUPS_CLOSED_MESSAGE } };

describe("invite-only sign-ups", () => {
  it("refuses an uninvited email and creates nothing", async () => {
    const { signUp, findUser } = await setUp();
    await expect(signUp("stranger@example.test")).rejects.toMatchObject(refused);
    expect(await findUser("stranger@example.test")).toBeUndefined();
  });

  it("makes an ADMIN_EMAILS address an Admin", async () => {
    const { signUp, findUser } = await setUp({ adminEmails: "first-admin@example.test" });
    await signUp("first-admin@example.test");
    expect((await findUser("first-admin@example.test"))?.role).toBe("admin");
  });

  it("gives an invited email the Role on its Invitation, once", async () => {
    const { signUp, findUser, invite } = await setUp();
    const token = await invite("eng@example.test", "engineer");
    await signUp("eng@example.test", token);
    expect((await findUser("eng@example.test"))?.role).toBe("engineer");
    await expect(signUp("eng@example.test", token)).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("makes an email invited as an Admin an Admin", async () => {
    const { signUp, findUser, invite } = await setUp();
    await signUp("boss@example.test", await invite("boss@example.test", "admin"));
    expect((await findUser("boss@example.test"))?.role).toBe("admin");
  });

  it("refuses an invited email that comes without its invitation link", async () => {
    const { signUp, findUser, invite } = await setUp();
    await invite("eng@example.test");
    await expect(signUp("eng@example.test")).rejects.toMatchObject(refused);
    await expect(signUp("eng@example.test", "made-up-token")).rejects.toMatchObject(refused);
    expect(await findUser("eng@example.test")).toBeUndefined();
  });

  it("confirms the email of someone who signs up from their invitation link, and sends no confirmation link", async () => {
    const { db, signUp, findUser, invite, outboxDir } = await setUp();
    await signUp("eng@example.test", await invite("eng@example.test"));
    const created = await findUser("eng@example.test");
    expect(created?.emailVerified).toBe(true);
    expect(await readOutbox(outboxDir)).toEqual([]);
    const [invitation] = await db.select().from(invitations).where(eq(invitations.email, "eng@example.test"));
    expect(invitation?.acceptedAt).toBeInstanceOf(Date);
    const entries = await db.select().from(auditLog);
    expect(entries).toEqual([
      expect.objectContaining({
        kind: "invitation_accepted",
        actorUserId: created!.id,
        subjectUserId: created!.id,
        detail: expect.objectContaining({ invitationId: invitation!.id, role: "engineer" }),
      }),
    ]);
  });

  it("still asks an ADMIN_EMAILS address to confirm its email", async () => {
    const { signUp, findUser, outboxDir } = await setUp({ adminEmails: "first-admin@example.test" });
    await signUp("first-admin@example.test");
    expect((await findUser("first-admin@example.test"))?.emailVerified).toBe(false);
    expect(await readOutbox(outboxDir)).toEqual([expect.objectContaining({ subject: expect.stringContaining("Confirm") })]);
  });

  it("refuses a direct POST to Better Auth's sign-up endpoint", async () => {
    const { auth, findUser } = await setUp();
    const response = await auth.handler(
      new Request(`${APP_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ name: "Sneaky", email: "sneaky@example.test", password: "a long password 1", role: "admin" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await findUser("sneaky@example.test")).toBeUndefined();
  });

  it("never takes a Role from the request", async () => {
    const { auth, findUser, invite } = await setUp();
    const invitationToken = await invite("eng@example.test", "engineer");
    await auth.handler(
      new Request(`${APP_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ name: "Eng", email: "eng@example.test", password: "a long password 1", role: "admin", invitationToken }),
      }),
    );
    expect((await findUser("eng@example.test"))?.role).toBe("engineer");
  });
});

describe("deactivated Users", () => {
  it("can't sign in", async () => {
    const { db, signUp, signIn } = await setUp({ adminEmails: "first-admin@example.test" });
    await signUp("first-admin@example.test");
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.email, "first-admin@example.test"));
    await expect(signIn("first-admin@example.test")).rejects.toMatchObject({ body: { code: ACCOUNT_DEACTIVATED_CODE } });
  });

  it("can't use an existing session on Better Auth's own endpoints", async () => {
    const { db, auth, findUser } = await setUp({ adminEmails: "first-admin@example.test" });
    const { headers } = await auth.api.signUpEmail({
      body: { name: "Pat Admin", email: "first-admin@example.test", password: "a long password 1" },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; ");
    const call = (path: string, init: RequestInit = {}) =>
      auth.handler(
        new Request(`${APP_URL}/api/auth${path}`, {
          ...init,
          headers: { cookie, origin: APP_URL, "content-type": "application/json" },
        }),
      );
    const firstAdmin = await findUser("first-admin@example.test");
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, firstAdmin!.id));

    const rename = await call("/update-user", { method: "POST", body: JSON.stringify({ name: "Renamed While Off" }) });
    expect(rename.status).toBe(401);
    expect((await findUser("first-admin@example.test"))?.name).toBe("Pat Admin");
    expect((await call("/list-sessions")).status).toBe(401);
    const getSession = await call("/get-session");
    expect(await getSession.json()).toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, firstAdmin!.id))).toEqual([]);
  });
});
