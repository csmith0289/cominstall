import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addCustomer, findCustomers } from "@/customers";
import { createTestDatabase } from "@/db/test-database";
import { customers, jobCardParts, jobCards, user, vehicles } from "@/db/schema";
import { addVehicle, suggestVehicles } from "@/vehicles";
import { createDraft, jobCardForEngineer, parseChanges, saveJobCard, ukToday, type JobCardChanges } from "./index";

// Invented people, firms and Regs, never real ones.
async function setUp() {
  const db = await createTestDatabase();
  await db.insert(user).values([
    { id: "eng-1", name: "Erin Engineer", email: "erin@example.test", role: "engineer", emailVerified: true },
    { id: "eng-2", name: "Owen Other", email: "owen@example.test", role: "engineer", emailVerified: true },
  ]);
  const [fleet] = await db.insert(customers).values({ name: "Testfleet Haulage" }).returning();
  const [van] = await db.insert(vehicles).values({ reg: "AB12CDE", customerId: fleet!.id }).returning();
  return { db, fleet: fleet!, van: van! };
}

const blank: JobCardChanges = { jobDate: "2026-11-22", vehicleId: null, mileage: null, workCarriedOut: "", parts: [] };

describe("ukToday", () => {
  it("gives the UK date, not the UTC one", () => {
    // 23:30 UTC in British Summer Time is already the next day in the UK.
    expect(ukToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(ukToday(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});

describe("createDraft", () => {
  it("makes a Draft with today's date, owned by the Engineer", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1", now: new Date("2026-11-22T09:00:00Z") });
    const [card] = await db.select().from(jobCards).where(eq(jobCards.id, id));
    expect(card).toMatchObject({ engineerId: "eng-1", status: "draft", jobDate: "2026-11-22", vehicleId: null, mileage: null });
  });
});

describe("jobCardForEngineer", () => {
  it("never returns another Engineer's Job Card", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    expect(await jobCardForEngineer(db, { id, engineerId: "eng-2" })).toBeNull();
    expect(await jobCardForEngineer(db, { id, engineerId: "eng-1" })).toMatchObject({ id, status: "draft" });
  });
});

describe("saveJobCard", () => {
  it("saves the whole card, with the Reg shown spaced and the Vehicle's Customer filled in", async () => {
    const { db, van, fleet } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    const changes: JobCardChanges = {
      jobDate: "2026-11-20",
      vehicleId: van.id,
      mileage: 123456,
      workCarriedOut: "Fitted tracker.\nTested OK.",
      parts: [
        { quantity: "1", part: "Tracker unit", partNumberOrNotes: "TRK-100" },
        { quantity: "", part: "", partNumberOrNotes: "" },
        { quantity: "2", part: "Cable tie", partNumberOrNotes: "" },
      ],
    };
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes })).toEqual({ ok: true });

    expect(await jobCardForEngineer(db, { id, engineerId: "eng-1" })).toEqual({
      id,
      status: "draft",
      jobDate: "2026-11-20",
      mileage: 123456,
      workCarriedOut: "Fitted tracker.\nTested OK.",
      vehicle: { id: van.id, reg: "AB12 CDE" },
      customer: { id: fleet.id, name: "Testfleet Haulage" },
      // Empty rows aren't kept.
      parts: [
        { quantity: "1", part: "Tracker unit", partNumberOrNotes: "TRK-100" },
        { quantity: "2", part: "Cable tie", partNumberOrNotes: "" },
      ],
    });

    // Saving again replaces the Parts Used rather than adding to them.
    await saveJobCard(db, { id, engineerId: "eng-1", changes: { ...changes, parts: [{ quantity: "3", part: "Fuse", partNumberOrNotes: "" }] } });
    expect(await db.select().from(jobCardParts)).toHaveLength(1);
  });

  it("keeps the Customer the Vehicle had at the time", async () => {
    const { db, van, fleet } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    await saveJobCard(db, { id, engineerId: "eng-1", changes: { ...blank, vehicleId: van.id } });
    const [buyer] = await db.insert(customers).values({ name: "New Owner Ltd" }).returning();
    await db.update(vehicles).set({ customerId: buyer!.id }).where(eq(vehicles.id, van.id));

    await saveJobCard(db, { id, engineerId: "eng-1", changes: { ...blank, vehicleId: van.id, mileage: 10 } });
    expect((await jobCardForEngineer(db, { id, engineerId: "eng-1" }))!.customer).toEqual({ id: fleet.id, name: "Testfleet Haulage" });
  });

  it("refuses another Engineer's Job Card and changes nothing", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    const before = await db.select().from(jobCards);
    expect(await saveJobCard(db, { id, engineerId: "eng-2", changes: { ...blank, workCarriedOut: "Not mine" } })).toHaveProperty("error");
    expect(await db.select().from(jobCards)).toEqual(before);
  });

  it("ignores an engineer id or Status sent with the changes", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    await saveJobCard(db, { id, engineerId: "eng-1", changes: { ...blank, engineerId: "eng-2", status: "complete" } });
    const [card] = await db.select().from(jobCards).where(eq(jobCards.id, id));
    expect(card).toMatchObject({ engineerId: "eng-1", status: "draft" });
  });

  it("refuses a Complete Job Card", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    await db.update(jobCards).set({ status: "complete" }).where(eq(jobCards.id, id));
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: blank })).toEqual({ error: "This Job Card is Complete, so it can't be changed." });
  });

  it("refuses a Vehicle that doesn't exist", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: { ...blank, vehicleId: "no-such-vehicle" } })).toHaveProperty("error");
  });

  // An old copy of the card (Back, or a second tab) only sends what was edited in it, so it can't wipe the rest.
  it("changes only the fields that are sent", async () => {
    const { db, van, fleet } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    const full: JobCardChanges = {
      jobDate: "2026-11-20",
      vehicleId: van.id,
      mileage: 88000,
      workCarriedOut: "Fitted new tail lift switch",
      parts: [{ quantity: "1", part: "Switch", partNumberOrNotes: "" }],
    };
    await saveJobCard(db, { id, engineerId: "eng-1", changes: full });

    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: { mileage: 88001 } })).toEqual({ ok: true });
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: { parts: [{ quantity: "2", part: "Fuse", partNumberOrNotes: "" }] } })).toEqual({
      ok: true,
    });
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: {} })).toEqual({ ok: true });

    expect(await jobCardForEngineer(db, { id, engineerId: "eng-1" })).toMatchObject({
      jobDate: "2026-11-20",
      mileage: 88001,
      workCarriedOut: "Fitted new tail lift switch",
      vehicle: { id: van.id },
      customer: { id: fleet.id },
      parts: [{ quantity: "2", part: "Fuse", partNumberOrNotes: "" }],
    });
  });

  it("doesn't count empty Parts Used rows towards the limit", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    const empty = { quantity: "", part: "", partNumberOrNotes: "" };
    const parts = [{ quantity: "1", part: "Relay", partNumberOrNotes: "" }, ...Array.from({ length: 104 }, () => empty)];
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes: { parts, workCarriedOut: "Still saves" } })).toEqual({ ok: true });
    expect(await jobCardForEngineer(db, { id, engineerId: "eng-1" })).toMatchObject({ workCarriedOut: "Still saves", parts: [parts[0]] });
  });

  // #32: text pasted from some apps or PDFs can hold a NUL character, which the database can't store.
  it("saves pasted text with a NUL character in it, leaving the character out", async () => {
    const { db } = await setUp();
    const id = await createDraft(db, { engineerId: "eng-1" });
    const changes = {
      mileage: 4600,
      workCarriedOut: "Replaced fuse\u0000 F12",
      parts: [{ quantity: "1\u0000", part: "Fuse\u0000", partNumberOrNotes: "F12\u0000" }],
    };
    expect(await saveJobCard(db, { id, engineerId: "eng-1", changes })).toEqual({ ok: true });
    expect(await jobCardForEngineer(db, { id, engineerId: "eng-1" })).toMatchObject({
      mileage: 4600,
      workCarriedOut: "Replaced fuse F12",
      parts: [{ quantity: "1", part: "Fuse", partNumberOrNotes: "F12" }],
    });
  });
});

describe("Customers with a NUL character", () => {
  it("adds and finds a Customer whose pasted details hold a NUL character", async () => {
    const { db } = await setUp();
    const added = await addCustomer(db, { name: "Nulltest\u0000 Couriers", phone: "07700 900\u0000123", email: "desk\u0000@example.test" });
    expect(added).toEqual({ customer: { id: expect.any(String), name: "Nulltest Couriers" } });
    const [stored] = await db.select().from(customers).where(eq(customers.name, "Nulltest Couriers"));
    expect(stored).toMatchObject({ phone: "07700 900123", email: "desk@example.test" });
    expect(await findCustomers(db, "Nulltest\u0000")).toEqual([{ id: expect.any(String), name: "Nulltest Couriers" }]);
    expect(await suggestVehicles(db, "ab12\u0000")).toHaveLength(1);
  });
});

describe("parseChanges", () => {
  it.each([
    ["a mileage with a fraction", { ...blank, mileage: 1.5 }],
    ["a negative mileage", { ...blank, mileage: -1 }],
    ["a mileage as text", { ...blank, mileage: "12" }],
    ["an eight-digit mileage", { ...blank, mileage: 12_345_678 }],
    ["a mileage too big to store", { ...blank, mileage: 1e21 }],
    ["an infinite mileage", { ...blank, mileage: Infinity }],
    ["no date", { ...blank, jobDate: "" }],
    ["an impossible date", { ...blank, jobDate: "2026-02-30" }],
    ["too many Parts Used", { ...blank, parts: Array.from({ length: 101 }, () => ({ quantity: "1", part: "Fuse", partNumberOrNotes: "" })) }],
    ["an absurd number of rows", { ...blank, parts: Array.from({ length: 1001 }, () => ({ quantity: "", part: "", partNumberOrNotes: "" })) }],
    ["a vehicle id that isn't text", { vehicleId: 7 }],
    ["a Part Used that isn't text", { ...blank, parts: [{ quantity: 1, part: "", partNumberOrNotes: "" }] }],
    ["something that isn't a card", "hello"],
  ])("refuses %s", (_name, input) => {
    expect(parseChanges(input)).toHaveProperty("error");
  });

  it("accepts an empty card and a mileage of 0", () => {
    expect(parseChanges(blank)).toEqual(blank);
    expect(parseChanges({ ...blank, mileage: 0 })).toEqual({ ...blank, mileage: 0 });
  });

  it("keeps only the fields that were sent, and drops empty Parts Used rows", () => {
    expect(parseChanges({ mileage: 9_999_999 })).toEqual({ mileage: 9_999_999 });
    expect(parseChanges({})).toEqual({});
    expect(
      parseChanges({
        parts: [
          { quantity: " ", part: "", partNumberOrNotes: "" },
          { quantity: "1", part: "Fuse", partNumberOrNotes: "" },
        ],
      }),
    ).toEqual({ parts: [{ quantity: "1", part: "Fuse", partNumberOrNotes: "" }] });
  });
});

describe("suggestVehicles", () => {
  it("finds a Vehicle however its Reg was typed, shown with the space", async () => {
    const { db, van, fleet } = await setUp();
    const expected = [{ id: van.id, reg: "AB12 CDE", customer: { id: fleet.id, name: "Testfleet Haulage" } }];
    expect(await suggestVehicles(db, "ab12 cde")).toEqual(expected);
    expect(await suggestVehicles(db, "AB-12 c")).toEqual(expected);
    expect(await suggestVehicles(db, "XY99")).toEqual([]);
    expect(await suggestVehicles(db, "  ")).toEqual([]);
    // LIKE wildcards are stripped by normalising, not matched.
    expect(await suggestVehicles(db, "%")).toEqual([]);
  });
});

describe("addVehicle", () => {
  it("stores the Reg normalised, with its Customer", async () => {
    const { db, fleet } = await setUp();
    const result = await addVehicle(db, { reg: "xy34 zzz", customerId: fleet.id });
    expect(result).toEqual({ vehicle: { id: expect.any(String), reg: "XY34 ZZZ", customer: { id: fleet.id, name: "Testfleet Haulage" } } });
    expect((await db.select({ reg: vehicles.reg }).from(vehicles)).map((row) => row.reg)).toContain("XY34ZZZ");
  });

  it("refuses a Reg that's already a Vehicle, however it's typed", async () => {
    const { db, fleet } = await setUp();
    expect(await addVehicle(db, { reg: "ab12-cde", customerId: fleet.id })).toEqual({
      error: "AB12 CDE is already a Vehicle. Choose it from the suggestions.",
    });
  });

  it("needs a Reg and an existing Customer", async () => {
    const { db, fleet } = await setUp();
    expect(await addVehicle(db, { reg: "A", customerId: fleet.id })).toHaveProperty("error");
    expect(await addVehicle(db, { reg: "ABCDEFGHIJK", customerId: fleet.id })).toHaveProperty("error");
    expect(await addVehicle(db, { reg: "XY34ZZZ", customerId: "" })).toHaveProperty("error");
    expect(await addVehicle(db, { reg: "XY34ZZZ", customerId: "no-such-customer" })).toHaveProperty("error");
  });
});

describe("Customers", () => {
  it("adds a Customer with a name, phone and email, and finds it by part of its name", async () => {
    const { db } = await setUp();
    const result = await addCustomer(db, { name: " Pretend Plumbing ", phone: "01632 960456", email: "Office@Pretend.test" });
    expect(result).toEqual({ customer: { id: expect.any(String), name: "Pretend Plumbing" } });
    const [stored] = await db.select().from(customers).where(eq(customers.name, "Pretend Plumbing"));
    expect(stored).toMatchObject({ phone: "01632 960456", email: "office@pretend.test" });
    expect((await findCustomers(db, "plumb")).map((c) => c.name)).toEqual(["Pretend Plumbing"]);
    expect((await findCustomers(db, "")).map((c) => c.name)).toEqual(["Pretend Plumbing", "Testfleet Haulage"]);
  });

  it("treats LIKE wildcards in a search as plain characters", async () => {
    const { db } = await setUp();
    expect(await findCustomers(db, "%")).toEqual([]);
    expect(await findCustomers(db, "_")).toEqual([]);
  });

  it("needs a name, and a valid email if one is given", async () => {
    const { db } = await setUp();
    expect(await addCustomer(db, { name: "  " })).toEqual({ error: "Enter the Customer's name." });
    expect(await addCustomer(db, { name: "Someone", email: "not an email" })).toHaveProperty("error");
    expect(await addCustomer(db, { name: "Someone", phone: "", email: "" })).toHaveProperty("customer");
  });
});
