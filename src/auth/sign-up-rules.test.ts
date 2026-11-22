import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { invitations } from "@/db/schema";
import { acceptInvitation, roleForNewAccount } from "./sign-up-rules";

const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const invite = (email: string, role: "engineer" | "admin", extra: Partial<typeof invitations.$inferInsert> = {}) => ({
  email,
  role,
  tokenHash: crypto.randomUUID(),
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
    expect(await roleForNewAccount(db, "Luke@Example.test", { ADMIN_EMAILS: "luke@example.test" })).toBe("admin");
  });

  it("gives an invited email the Role on its Invitation", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values(invite("eng@example.test", "engineer"));
    expect(await roleForNewAccount(db, "ENG@example.test", {})).toBe("engineer");
  });

  it("ignores expired, cancelled and accepted Invitations", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values([
      invite("expired@example.test", "engineer", { expiresAt: new Date(Date.now() - 1000) }),
      invite("cancelled@example.test", "engineer", { cancelledAt: new Date() }),
      invite("accepted@example.test", "engineer", { acceptedAt: new Date() }),
    ]);
    for (const email of ["expired@example.test", "cancelled@example.test", "accepted@example.test"]) {
      expect(await roleForNewAccount(db, email, {})).toBeNull();
    }
  });

  it("refuses an email once its Invitation is accepted", async () => {
    const db = await createTestDatabase();
    await db.insert(invitations).values(invite("eng@example.test", "admin"));
    expect((await acceptInvitation(db, "eng@example.test"))?.role).toBe("admin");
    expect(await roleForNewAccount(db, "eng@example.test", {})).toBeNull();
  });
});
