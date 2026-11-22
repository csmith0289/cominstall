import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { invitations } from "@/db/schema";
import { hashInvitationToken, roleForNewAccount } from "./sign-up-rules";

const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const invite = (email: string, role: "engineer" | "admin", token: string, extra: Partial<typeof invitations.$inferInsert> = {}) => ({
  email,
  role,
  tokenHash: hashInvitationToken(token),
  expiresAt: inAWeek(),
  ...extra,
});

describe("roleForNewAccount", () => {
  it("refuses everyone when ADMIN_EMAILS is unset and nobody is invited", async () => {
    const db = await createTestDatabase();
    expect(await roleForNewAccount(db, "someone@example.test", {})).toBeNull();
  });

  it("makes an ADMIN_EMAILS address an Admin, in any case", async () => {
    const db = await createTestDatabase();
    expect(await roleForNewAccount(db, "Pat@Example.test", { ADMIN_EMAILS: "pat@example.test" })).toBe("admin");
  });

  it("gives an invited email the Role on its Invitation when it brings the link's token", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values([invite("eng@example.test", "engineer", "tok-eng"), invite("boss@example.test", "admin", "tok-boss")]);
    expect(await roleForNewAccount(db, "ENG@example.test", {}, new Date(), "tok-eng")).toBe("engineer");
    expect(await roleForNewAccount(db, "boss@example.test", {}, new Date(), "tok-boss")).toBe("admin");
  });

  it("refuses an invited email without the token, or with another Invitation's token", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values([invite("eng@example.test", "engineer", "tok-eng"), invite("boss@example.test", "admin", "tok-boss")]);
    expect(await roleForNewAccount(db, "eng@example.test", {})).toBeNull();
    expect(await roleForNewAccount(db, "eng@example.test", {}, new Date(), "tok-boss")).toBeNull();
    expect(await roleForNewAccount(db, "eng@example.test", {}, new Date(), "made-up")).toBeNull();
  });

  it("ignores expired, cancelled and accepted Invitations", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values([
      invite("expired@example.test", "engineer", "t1", { expiresAt: new Date(Date.now() - 1000) }),
      invite("cancelled@example.test", "engineer", "t2", { cancelledAt: new Date() }),
      invite("accepted@example.test", "engineer", "t3", { acceptedAt: new Date() }),
    ]);
    for (const [email, token] of [
      ["expired@example.test", "t1"],
      ["cancelled@example.test", "t2"],
      ["accepted@example.test", "t3"],
    ] as const) {
      expect(await roleForNewAccount(db, email, {}, new Date(), token)).toBeNull();
    }
  });
});
