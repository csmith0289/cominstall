import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { invitations, session, user } from "@/db/schema";
import { createMailer } from "@/email";
import { ACCOUNT_DEACTIVATED_CODE, createAuth, SIGNUPS_CLOSED_MESSAGE } from "./index";

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
  const signUp = (email: string, password = "a long password 1") =>
    auth.api.signUpEmail({ body: { name: "Sam Engineer", email, password, callbackURL: "/confirm-email" } });
  const signIn = (email: string, password = "a long password 1") => auth.api.signInEmail({ body: { email, password } });
  const findUser = async (email: string) => (await db.select().from(user).where(eq(user.email, email)))[0];
  const invite = (email: string, role: "engineer" | "admin" = "engineer") =>
    db.insert(invitations).values({
      email,
      role,
      tokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  return { db, auth, signUp, signIn, findUser, invite };
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
    await invite("eng@example.test", "engineer");
    await signUp("eng@example.test");
    expect((await findUser("eng@example.test"))?.role).toBe("engineer");
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
    await invite("eng@example.test", "engineer");
    await auth.handler(
      new Request(`${APP_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ name: "Eng", email: "eng@example.test", password: "a long password 1", role: "admin" }),
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
