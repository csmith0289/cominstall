import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { auditLog, user } from "@/db/schema";
import { acceptTerms, jobCardPdfFooter, needsTermsAcceptance, PRIVACY_PATH, TERMS_VERSION } from "./index";

// Invented people only.
async function setUp() {
  const db = await createTestDatabase();
  await db.insert(user).values([
    { id: "eng-1", name: "Ben Engineer", email: "ben@example.test", role: "engineer", emailVerified: true },
    { id: "operator", name: "Support", email: "support@example.test", role: "admin", emailVerified: true },
  ]);
  const find = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0]!;
  return { db, find, audit: () => db.select().from(auditLog) };
}

describe("needsTermsAcceptance", () => {
  it("asks a User who has never accepted", () => {
    expect(needsTermsAcceptance({ termsVersion: null })).toBe(true);
  });

  it("doesn't ask a User who accepted the current version", () => {
    expect(needsTermsAcceptance({ termsVersion: TERMS_VERSION })).toBe(false);
  });

  it("asks again once TERMS_VERSION is bumped", () => {
    expect(needsTermsAcceptance({ termsVersion: "v1" }, "v1")).toBe(false);
    expect(needsTermsAcceptance({ termsVersion: "v1" }, "v2")).toBe(true);
  });
});

describe("acceptTerms", () => {
  it("stores the version and time, and writes it to the Audit Log", async () => {
    const { db, find, audit } = await setUp();
    const now = new Date("2026-11-23T09:00:00Z");

    await acceptTerms(db, { userId: "eng-1", version: "v1", now });

    expect(await find("eng-1")).toMatchObject({ termsVersion: "v1", termsAcceptedAt: now });
    expect(await audit()).toEqual([
      expect.objectContaining({ kind: "terms_accepted", actorUserId: "eng-1", subjectUserId: "eng-1", asOperator: false, detail: { version: "v1" } }),
    ]);
  });

  it("asks again after a bump, and records each acceptance", async () => {
    const { db, find, audit } = await setUp();
    await acceptTerms(db, { userId: "eng-1", version: "v1" });
    expect(needsTermsAcceptance(await find("eng-1"), "v2")).toBe(true);

    await acceptTerms(db, { userId: "eng-1", version: "v2" });

    expect(needsTermsAcceptance(await find("eng-1"), "v2")).toBe(false);
    expect((await audit()).map((row) => row.detail)).toEqual([{ version: "v1" }, { version: "v2" }]);
  });

  it("does nothing new when the same version is accepted twice (a double tap)", async () => {
    const { db, find, audit } = await setUp();
    const first = new Date("2026-11-23T09:00:00Z");
    await acceptTerms(db, { userId: "eng-1", version: "v1", now: first });
    await acceptTerms(db, { userId: "eng-1", version: "v1", now: new Date("2026-11-23T09:00:05Z") });

    expect((await find("eng-1")).termsAcceptedAt).toEqual(first);
    expect(await audit()).toHaveLength(1);
  });

  it("marks the Operator's acceptance as an Operator entry", async () => {
    const { db, audit } = await setUp();
    await acceptTerms(db, { userId: "operator", version: "v1", asOperator: true });
    expect(await audit()).toEqual([expect.objectContaining({ actorUserId: "operator", asOperator: true })]);
  });
});

describe("jobCardPdfFooter", () => {
  it("links to the privacy notice on the app's own address", () => {
    expect(jobCardPdfFooter("https://jobcards.example.test/")).toBe(
      `Com-Install Ltd · Privacy notice: https://jobcards.example.test${PRIVACY_PATH}`,
    );
  });
});
