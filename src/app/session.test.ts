import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "@/auth";
import { hashInvitationToken } from "@/auth/sign-up-rules";
import type { Database } from "@/db";
import { invitations, user } from "@/db/schema";
import { createMailer } from "@/email";
import { createTestDatabase } from "@/db/test-database";
import { TERMS_VERSION } from "@/legal";

const APP_URL = "http://localhost:3000";
const ADMIN = "admin@example.test";
const ENGINEER = "engineer@example.test";
const PASSWORD = "a long password 1";

// The request the page is handling, and the auth it uses: set by each test.
let requestHeaders = new Headers();
let currentAuth: Auth;

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth")>()),
  getAuth: async () => currentAuth,
}));

const { getSignedInUser, requireAdmin, requireUser } = await import("./session");

let db: Database;

beforeEach(async () => {
  db = await createTestDatabase();
  const outboxDir = await mkdtemp(join(tmpdir(), "session-outbox-"));
  currentAuth = createAuth(db, {
    appUrl: APP_URL,
    mailer: createMailer({ env: { EMAIL_OUTBOX_DIR: outboxDir }, log: () => {} }),
    env: { ADMIN_EMAILS: ADMIN },
  });
  requestHeaders = new Headers();
});

// Signs up and makes the next request carry that account's session cookie.
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
  const cookie = headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
  requestHeaders = new Headers({ cookie });
  // Most tests are about a User who has already accepted the terms of use.
  await db.update(user).set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }).where(eq(user.email, email));
}

// What next/navigation's notFound() and redirect() throw.
const notFound = { digest: expect.stringContaining("404") };
const redirectedToSignIn = { digest: expect.stringContaining("/sign-in") };
const redirectedToAcceptTerms = { digest: expect.stringContaining("/accept-terms") };

describe("requireUser()", () => {
  it("returns the signed-in User", async () => {
    await signUpAndUseSession(ENGINEER);
    expect(await requireUser()).toMatchObject({ email: ENGINEER, role: "engineer" });
  });

  it("sends a User who hasn't accepted the terms of use to accept them first", async () => {
    await signUpAndUseSession(ENGINEER);
    await db.update(user).set({ termsVersion: null, termsAcceptedAt: null }).where(eq(user.email, ENGINEER));
    expect(await getSignedInUser()).toMatchObject({ email: ENGINEER, termsVersion: null });
    await expect(requireUser()).rejects.toMatchObject(redirectedToAcceptTerms);
  });

  it("asks again when the User accepted an older version", async () => {
    await signUpAndUseSession(ADMIN);
    await db.update(user).set({ termsVersion: "an-older-version" }).where(eq(user.email, ADMIN));
    await expect(requireUser()).rejects.toMatchObject(redirectedToAcceptTerms);
    await expect(requireAdmin()).rejects.toMatchObject(redirectedToAcceptTerms);
  });

  it("sends anyone signed out to the sign-in page", async () => {
    await expect(requireUser()).rejects.toMatchObject(redirectedToSignIn);
  });

  it("refuses a deactivated User's existing session", async () => {
    await signUpAndUseSession(ENGINEER);
    await db.update(user).set({ deactivatedAt: new Date() }).where(eq(user.email, ENGINEER));
    expect(await getSignedInUser()).toBeUndefined();
    await expect(requireUser()).rejects.toMatchObject(redirectedToSignIn);
  });
});

describe("requireAdmin()", () => {
  it("returns an Admin", async () => {
    await signUpAndUseSession(ADMIN);
    expect(await requireAdmin()).toMatchObject({ email: ADMIN, role: "admin" });
  });

  it("gives an Engineer a 404", async () => {
    await signUpAndUseSession(ENGINEER);
    await expect(requireAdmin()).rejects.toMatchObject(notFound);
  });
});
