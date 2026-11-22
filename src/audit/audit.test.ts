import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/test-database";
import { auditLog, user } from "@/db/schema";
import { recordAudit } from "./index";

describe("recordAudit", () => {
  it("records who did what, marking Operator changes", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "Pat", email: "pat@example.test", role: "admin" });

    await recordAudit(db, { actorUserId: "u1", kind: "user_role_changed", subjectUserId: "u1", detail: { to: "admin" } });
    await recordAudit(db, { actorUserId: "u1", asOperator: true, kind: "job_card_reopened" });

    const rows = await db.select().from(auditLog).orderBy(auditLog.at);
    expect(rows.map((row) => [row.kind, row.asOperator])).toEqual([
      ["user_role_changed", false],
      ["job_card_reopened", true],
    ]);
    expect(rows[0]!.detail).toEqual({ to: "admin" });
  });
});
