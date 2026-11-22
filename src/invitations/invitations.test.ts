import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { auditLog, invitations, user } from "@/db/schema";
import type { Email } from "@/email";
import { cancelInvitation, invitationForLink, inviteUser, markInvitationAccepted, openInvitations, resendInvitation } from "./index";

const APP_URL = "http://localhost:3000";
const DAY = 24 * 60 * 60 * 1000;

async function setUp() {
  const db = await createTestDatabase();
  const [admin] = await db
    .insert(user)
    .values({ id: "admin-1", name: "Alex Admin", email: "alex.admin@example.test", role: "admin", emailVerified: true })
    .returning();
  const sent: Email[] = [];
  const mailer = vi.fn(async (email: Email) => {
    sent.push(email);
  });
  const sending = { actorUserId: admin!.id, appUrl: APP_URL, mailer };
  // The token in the newest email's link.
  const lastToken = () => new URL(sent.at(-1)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  const audit = () => db.select().from(auditLog);
  return { db, admin: admin!, sent, mailer, sending, lastToken, audit };
}

describe("inviteUser", () => {
  it("creates a pending Invitation, emails a 7-day link naming Com-Install and the Role, and audits it", async () => {
    const { db, sent, sending, lastToken, audit, admin } = await setUp();
    const now = new Date("2026-11-22T10:00:00Z");

    expect(await inviteUser(db, { ...sending, email: " New.Engineer@Example.test ", role: "engineer", now })).toEqual({ ok: true });

    const [invitation] = await db.select().from(invitations);
    expect(invitation).toMatchObject({ email: "new.engineer@example.test", role: "engineer", invitedByUserId: admin.id });
    expect(invitation!.expiresAt).toEqual(new Date(now.getTime() + 7 * DAY));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("new.engineer@example.test");
    expect(sent[0]!.subject).toContain("Com-Install");
    expect(sent[0]!.text).toContain("Com-Install Ltd");
    expect(sent[0]!.text).toContain("as an Engineer");
    expect(sent[0]!.text).toContain("7 days");
    expect(sent[0]!.text).toContain(`${APP_URL}/invitation?token=`);
    // Only the token's hash is stored.
    expect(invitation!.tokenHash).not.toBe(lastToken());
    expect(await audit()).toEqual([
      expect.objectContaining({
        kind: "invitation_sent",
        actorUserId: admin.id,
        detail: { invitationId: invitation!.id, email: "new.engineer@example.test", role: "engineer" },
      }),
    ]);
  });

  it("names the Admin Role in an Admin's invitation", async () => {
    const { db, sent, sending } = await setUp();
    await inviteUser(db, { ...sending, email: "boss@example.test", role: "admin" });
    expect(sent[0]!.text).toContain("as an Admin");
  });

  it("refuses an email that already has an account", async () => {
    const { db, sent, sending } = await setUp();
    const result = await inviteUser(db, { ...sending, email: "ALEX.admin@example.test", role: "engineer" });
    expect(result).toEqual({ error: "alex.admin@example.test already has an account." });
    expect(await db.select().from(invitations)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses an email that already has a pending Invitation", async () => {
    const { db, sending, audit } = await setUp();
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer" });
    const result = await inviteUser(db, { ...sending, email: "Eng@example.test", role: "admin" });
    expect(result).toEqual({ error: expect.stringContaining("already has a pending Invitation") });
    expect(await db.select().from(invitations)).toHaveLength(1);
    expect(await audit()).toHaveLength(1);
  });

  it("replaces an expired Invitation for the same email", async () => {
    const { db, sending } = await setUp();
    const long_ago = new Date(Date.now() - 30 * DAY);
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer", now: long_ago });
    expect(await inviteUser(db, { ...sending, email: "eng@example.test", role: "admin" })).toEqual({ ok: true });
    expect(await openInvitations(db)).toEqual([expect.objectContaining({ email: "eng@example.test", role: "admin" })]);
  });

  it("refuses a malformed email or an unknown Role", async () => {
    const { db, sending } = await setUp();
    for (const email of ["", "not-an-email", "a b@example.test", `${"x".repeat(250)}@example.test`]) {
      expect(await inviteUser(db, { ...sending, email, role: "engineer" })).toEqual({ error: "Enter a valid email address." });
    }
    expect(await inviteUser(db, { ...sending, email: "eng@example.test", role: "operator" })).toEqual({
      error: "Choose a Role: Engineer or Admin.",
    });
    expect(await db.select().from(invitations)).toEqual([]);
  });

  it("keeps the Invitation when the email can't be sent", async () => {
    const { db, sending } = await setUp();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    expect(await inviteUser(db, { ...sending, mailer: failing, email: "eng@example.test", role: "engineer" })).toEqual({ ok: true });
    expect(await openInvitations(db)).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("invitationForLink", () => {
  it("finds the pending Invitation behind a link", async () => {
    const { db, sending, lastToken } = await setUp();
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer" });
    expect(await invitationForLink(db, lastToken())).toMatchObject({ state: "pending", invitation: { email: "eng@example.test" } });
  });

  it("says a link is expired after 7 days", async () => {
    const { db, sending, lastToken } = await setUp();
    const sentAt = new Date("2026-11-01T09:00:00Z");
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer", now: sentAt });
    expect((await invitationForLink(db, lastToken(), new Date(sentAt.getTime() + 7 * DAY - 1000))).state).toBe("pending");
    expect(await invitationForLink(db, lastToken(), new Date(sentAt.getTime() + 7 * DAY))).toEqual({ state: "expired" });
  });

  it("says a link is used once accepted or cancelled, and for a made-up or missing token", async () => {
    const { db, sending, lastToken } = await setUp();
    await inviteUser(db, { ...sending, email: "one@example.test", role: "engineer" });
    const accepted = lastToken();
    await db.insert(user).values({ id: "eng-1", name: "Eng One", email: "one@example.test" });
    await markInvitationAccepted(db, { token: accepted, userId: "eng-1" });
    await inviteUser(db, { ...sending, email: "two@example.test", role: "engineer" });
    const cancelled = lastToken();
    const [two] = await db.select().from(invitations).where(eq(invitations.email, "two@example.test"));
    await cancelInvitation(db, { invitationId: two!.id, actorUserId: sending.actorUserId });

    for (const token of [accepted, cancelled, "made-up", ""]) expect(await invitationForLink(db, token)).toEqual({ state: "used" });
  });
});

describe("resendInvitation", () => {
  it("sends a new 7-day link, stops the old one working, and audits it", async () => {
    const { db, sent, sending, lastToken, audit } = await setUp();
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer", now: new Date(Date.now() - 10 * DAY) });
    const oldToken = lastToken();
    const [invitation] = await openInvitations(db);
    const now = new Date();

    expect(await resendInvitation(db, { ...sending, invitationId: invitation!.id, now })).toEqual({ ok: true });

    expect(sent).toHaveLength(2);
    expect(lastToken()).not.toBe(oldToken);
    expect(await invitationForLink(db, oldToken)).toEqual({ state: "used" });
    expect(await invitationForLink(db, lastToken())).toMatchObject({ state: "pending" });
    expect((await openInvitations(db))[0]!.expiresAt).toEqual(new Date(now.getTime() + 7 * DAY));
    expect((await audit()).map((entry) => entry.kind)).toEqual(["invitation_sent", "invitation_resent"]);
  });

  it("refuses an accepted or cancelled Invitation", async () => {
    const { db, sent, sending } = await setUp();
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer" });
    const [invitation] = await openInvitations(db);
    await cancelInvitation(db, { invitationId: invitation!.id, actorUserId: sending.actorUserId });
    expect(await resendInvitation(db, { ...sending, invitationId: invitation!.id })).toEqual({ error: expect.stringContaining("already") });
    expect(await resendInvitation(db, { ...sending, invitationId: "no-such-id" })).toEqual({ error: expect.stringContaining("already") });
    expect(sent).toHaveLength(1);
  });
});

describe("cancelInvitation", () => {
  it("cancels a pending Invitation, so its link stops working, and audits it", async () => {
    const { db, sending, lastToken, audit, admin } = await setUp();
    await inviteUser(db, { ...sending, email: "eng@example.test", role: "engineer" });
    const [invitation] = await openInvitations(db);

    expect(await cancelInvitation(db, { invitationId: invitation!.id, actorUserId: admin.id })).toEqual({ ok: true });

    expect(await openInvitations(db)).toEqual([]);
    expect(await invitationForLink(db, lastToken())).toEqual({ state: "used" });
    expect((await audit()).at(-1)).toMatchObject({
      kind: "invitation_cancelled",
      actorUserId: admin.id,
      detail: { invitationId: invitation!.id, email: "eng@example.test", role: "engineer" },
    });
    expect(await cancelInvitation(db, { invitationId: invitation!.id, actorUserId: admin.id })).toEqual({
      error: expect.stringContaining("already"),
    });
    expect(await audit()).toHaveLength(2);
  });
});
