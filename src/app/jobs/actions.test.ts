import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, type Auth } from "@/auth";
import { hashInvitationToken } from "@/auth/sign-up-rules";
import type { Database } from "@/db";
import { customers, invitations, jobCards, user, vehicles } from "@/db/schema";
import { createMailer } from "@/email";
import { createTestDatabase } from "@/db/test-database";
import { TERMS_VERSION } from "@/legal";

// Invented test accounts, firms and Regs, never real ones.
const APP_URL = "http://localhost:3000";
const PASSWORD = "a long password 1";

let requestHeaders = new Headers();
let currentAuth: Auth;
let db: Database;

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/auth")>()),
  getAuth: async () => currentAuth,
}));
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDatabase: async () => db,
}));

const { addNewCustomer, addNewVehicle, findVehicles, latestJobCard, newJobCard, saveJobCardChanges, searchCustomers } = await import("./actions");

beforeEach(async () => {
  db = await createTestDatabase();
  const outboxDir = await mkdtemp(join(tmpdir(), "jobs-actions-outbox-"));
  currentAuth = createAuth(db, { appUrl: APP_URL, mailer: createMailer({ env: { EMAIL_OUTBOX_DIR: outboxDir }, log: () => {} }), env: {} });
  requestHeaders = new Headers();
});

// Signs an invited Engineer up and makes the next request carry their session cookie. Returns their id.
async function signInAsEngineer(email: string): Promise<string> {
  const invitationToken = crypto.randomUUID();
  await db.insert(invitations).values({
    email,
    role: "engineer",
    tokenHash: hashInvitationToken(invitationToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  // invitationToken is this app's own sign-up field (src/auth), not in Better Auth's types.
  const body = { name: "Sam Test", email, password: PASSWORD, invitationToken };
  const { headers } = await currentAuth.api.signUpEmail({ body, returnHeaders: true });
  requestHeaders = new Headers({
    cookie: headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; "),
  });
  // These tests are about Engineers who have already accepted the terms of use.
  await db.update(user).set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }).where(eq(user.email, email));
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return found!.id;
}

// What next/navigation's redirect() throws.
const redirectedTo = (path: string | RegExp) => ({ digest: expect.stringMatching(path) });
const redirectedToSignIn = redirectedTo(/\/sign-in/);

async function newDraftId(): Promise<string> {
  const thrown = await newJobCard().catch((error: unknown) => error as { digest: string });
  const id = thrown.digest.match(/\/jobs\/([^;]+)/)![1]!;
  return id;
}

const blank = { jobDate: "2026-11-22", vehicleId: null, mileage: null, workCarriedOut: "", parts: [] };

describe("Job Card actions", () => {
  it("open a new Draft owned by the signed-in Engineer", async () => {
    const engineerId = await signInAsEngineer("erin@example.test");
    await expect(newJobCard()).rejects.toMatchObject(redirectedTo(/\/jobs\/[0-9a-f-]+/));
    const [card] = await db.select().from(jobCards);
    expect(card).toMatchObject({ engineerId, status: "draft" });
  });

  it("save only the signed-in Engineer's own Job Card, whatever engineer id is sent", async () => {
    const owner = await signInAsEngineer("erin@example.test");
    const id = await newDraftId();
    expect(await saveJobCardChanges(id, { ...blank, engineerId: "someone-else", workCarriedOut: "Mine" })).toEqual({ ok: true });
    expect((await db.select().from(jobCards))[0]).toMatchObject({ engineerId: owner, workCarriedOut: "Mine" });

    // Another Engineer, holding the first one's Job Card id.
    await signInAsEngineer("owen@example.test");
    expect(await saveJobCardChanges(id, { ...blank, workCarriedOut: "Not mine" })).toHaveProperty("error");
    expect((await db.select().from(jobCards))[0]).toMatchObject({ engineerId: owner, workCarriedOut: "Mine" });
  });

  it("load the latest copy of the signed-in Engineer's own Job Card, and nobody else's", async () => {
    await signInAsEngineer("erin@example.test");
    const id = await newDraftId();
    await saveJobCardChanges(id, { workCarriedOut: "Newer work" });
    expect(await latestJobCard(id)).toMatchObject({ id, workCarriedOut: "Newer work" });
    expect(await latestJobCard(42)).toBeNull();

    await signInAsEngineer("owen@example.test");
    expect(await latestJobCard(id)).toBeNull();
  });

  it("add a Customer and a Vehicle, then suggest the Vehicle by Reg", async () => {
    await signInAsEngineer("erin@example.test");
    const added = await addNewCustomer({ name: "Testfleet Haulage", phone: "", email: "" });
    if (!("customer" in added)) throw new Error(added.error);
    expect((await searchCustomers("fleet")).map((c) => c.name)).toEqual(["Testfleet Haulage"]);

    const vehicle = await addNewVehicle({ reg: "ab12 cde", customerId: added.customer.id });
    expect(vehicle).toMatchObject({ vehicle: { reg: "AB12 CDE", customer: { name: "Testfleet Haulage" } } });
    expect(await findVehicles("ab12 cde")).toEqual([expect.objectContaining({ reg: "AB12 CDE" })]);
  });

  it("send anyone signed out to the sign-in page and change nothing", async () => {
    const [fleet] = await db.insert(customers).values({ name: "Testfleet Haulage" }).returning();
    await expect(newJobCard()).rejects.toMatchObject(redirectedToSignIn);
    await expect(saveJobCardChanges("any-id", blank)).rejects.toMatchObject(redirectedToSignIn);
    await expect(latestJobCard("any-id")).rejects.toMatchObject(redirectedToSignIn);
    await expect(findVehicles("AB")).rejects.toMatchObject(redirectedToSignIn);
    await expect(searchCustomers("")).rejects.toMatchObject(redirectedToSignIn);
    await expect(addNewCustomer({ name: "Sneaky Ltd" })).rejects.toMatchObject(redirectedToSignIn);
    await expect(addNewVehicle({ reg: "XY34ZZZ", customerId: fleet!.id })).rejects.toMatchObject(redirectedToSignIn);
    expect(await db.select().from(jobCards)).toEqual([]);
    expect(await db.select().from(vehicles)).toEqual([]);
    expect(await db.select().from(customers)).toHaveLength(1);
  });
});
